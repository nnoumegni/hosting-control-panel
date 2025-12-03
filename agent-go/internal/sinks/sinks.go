package sinks

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jetcamer/agent-go/internal/config"
	"github.com/jetcamer/agent-go/internal/security"
)

type Event struct {
	RemoteIP  string    `json:"ip"`
	Path      string    `json:"path"`
	Method    string    `json:"method"`
	Status    int       `json:"status"`
	Bytes     int64     `json:"bytes"`
	UserAgent string    `json:"ua"`
	Referer   string    `json:"referer"`
	Timestamp time.Time `json:"ts"`
	Source    string    `json:"source"`
	Raw       *string   `json:"raw,omitempty"`
}

// Aggregator holds last N events and basic stats for /live.
type Aggregator struct {
	mu             sync.RWMutex
	maxEvents      int
	events         []Event
	total          uint64
	perPath        map[string]uint64
	perIP          map[string]uint64
	perStatus      map[int]uint64
	startedAt      time.Time
	countryResolver *security.CountryResolver
}

func NewAggregator(maxEvents int) *Aggregator {
	if maxEvents <= 0 {
		maxEvents = 1000
	}
	return &Aggregator{
		maxEvents: maxEvents,
		events:    make([]Event, 0, maxEvents),
		perPath:   make(map[string]uint64),
		perIP:     make(map[string]uint64),
		perStatus: make(map[int]uint64),
		startedAt: time.Now(),
	}
}

func (a *Aggregator) SetCountryResolver(resolver *security.CountryResolver) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.countryResolver = resolver
}

// TestCountryResolution tests country resolution for a given IP (for debugging)
func (a *Aggregator) TestCountryResolution(ip string) map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	result := map[string]interface{}{
		"resolverExists": a.countryResolver != nil,
		"country":        "",
		"error":           "",
	}
	
	if a.countryResolver == nil {
		result["error"] = "country resolver is nil"
		return result
	}
	
	country := a.countryResolver.Country(ip)
	result["country"] = country
	if country == "" {
		result["error"] = "country resolution returned empty string"
	}
	
	return result
}

func (a *Aggregator) Add(evt Event) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.total++
	a.perPath[evt.Path]++
	a.perIP[evt.RemoteIP]++
	a.perStatus[evt.Status]++

	if len(a.events) >= a.maxEvents {
		// drop oldest
		copy(a.events, a.events[1:])
		a.events[len(a.events)-1] = evt
	} else {
		a.events = append(a.events, evt)
	}
}

type TopItem struct {
	Key   string `json:"key"`
	Count uint64 `json:"count"`
}

type LiveSnapshot struct {
	Since     time.Time `json:"since"`
	Total     uint64    `json:"total"`
	Events    []Event   `json:"events"`
	TopPaths  []TopItem `json:"topPaths"`
	TopIPs    []TopItem `json:"topIPs"`
	TopStatus []TopItem `json:"topStatus"`
}

type SummarySnapshot struct {
	Since        time.Time              `json:"since"`
	Total        uint64                 `json:"total"`
	Stats        SummaryStats           `json:"stats"`
	Aggregations SummaryAggregations     `json:"aggregations"`
	TopPaths     []TopItem               `json:"topPaths"`
	TopIPs       []TopItem               `json:"topIPs"`
	TopStatus    []TopItem               `json:"topStatus"`
}

type SummaryStats struct {
	Visitors  int `json:"visitors"`
	Pageviews int `json:"pageviews"`
	Countries int `json:"countries"`
}

type SummaryAggregations struct {
	ByCountry map[string]uint64 `json:"byCountry"`
	ByBrowser map[string]uint64 `json:"byBrowser"`
	ByPlatform map[string]uint64 `json:"byPlatform"`
}

// truncateString truncates a string to maxLen characters, appending "..." if truncated
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}

func (a *Aggregator) Snapshot() LiveSnapshot {
	a.mu.RLock()
	defer a.mu.RUnlock()

	snap := LiveSnapshot{
		Since: a.startedAt,
		Total: a.total,
	}
	// copy events slice, clear raw field, and truncate path to keep response small
	snap.Events = make([]Event, len(a.events))
	for i, evt := range a.events {
		snap.Events[i] = evt
		snap.Events[i].Raw = nil // Clear raw field for live response (omitempty will omit it)
		snap.Events[i].Path = truncateString(evt.Path, 20) // Truncate path to max 20 chars
	}

	// top N (5) paths, IPs, and status - truncate keys
	snap.TopPaths = truncateTopItems(topNFromMap(a.perPath, 5))
	snap.TopIPs = truncateTopItems(topNFromMap(a.perIP, 5))
	snap.TopStatus = topNFromIntMap(a.perStatus, 5)

	return snap
}

// truncateTopItems truncates the Key field in TopItem slice
func truncateTopItems(items []TopItem) []TopItem {
	for i := range items {
		items[i].Key = truncateString(items[i].Key, 20)
	}
	return items
}

// parseBrowser extracts browser name from User-Agent string
func parseBrowser(ua string) string {
	ua = strings.ToLower(ua)
	switch {
	case strings.Contains(ua, "chrome") && !strings.Contains(ua, "edg") && !strings.Contains(ua, "opr"):
		return "Chrome"
	case strings.Contains(ua, "firefox"):
		return "Firefox"
	case strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome"):
		return "Safari"
	case strings.Contains(ua, "edg"):
		return "Edge"
	case strings.Contains(ua, "opr") || strings.Contains(ua, "opera"):
		return "Opera"
	case strings.Contains(ua, "msie") || strings.Contains(ua, "trident"):
		return "IE"
	default:
		return "Other"
	}
}

// parsePlatform extracts platform/OS name from User-Agent string
func parsePlatform(ua string) string {
	ua = strings.ToLower(ua)
	switch {
	case strings.Contains(ua, "windows"):
		return "Windows"
	case strings.Contains(ua, "mac os x") || strings.Contains(ua, "macintosh"):
		return "macOS"
	case strings.Contains(ua, "linux") && !strings.Contains(ua, "android"):
		return "Linux"
	case strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") || strings.Contains(ua, "ipod"):
		return "iOS"
	case strings.Contains(ua, "android"):
		return "Android"
	default:
		return "Other"
	}
}

func (a *Aggregator) Summary() SummarySnapshot {
	a.mu.RLock()
	defer a.mu.RUnlock()

	// Count unique IPs for visitors (use perIP map which tracks all unique IPs)
	visitorCount := len(a.perIP)
	
	byCountry := make(map[string]uint64)
	byBrowser := make(map[string]uint64)
	byPlatform := make(map[string]uint64)
	uniqueCountries := make(map[string]struct{})

	// Aggregate browser, platform, and country from current events buffer
	resolverStatus := "nil"
	if a.countryResolver != nil {
		resolverStatus = "initialized"
	}
	log.Printf("summary: processing %d events, country resolver: %s", len(a.events), resolverStatus)
	
	countryResolvedCount := 0
	for _, evt := range a.events {
		// Parse browser and platform from User-Agent
		browser := parseBrowser(evt.UserAgent)
		platform := parsePlatform(evt.UserAgent)
		byBrowser[browser]++
		byPlatform[platform]++
		
		// Resolve country from IP
		if a.countryResolver != nil {
			country := a.countryResolver.Country(evt.RemoteIP)
			if country != "" {
				byCountry[country]++
				uniqueCountries[country] = struct{}{}
				countryResolvedCount++
			}
		}
	}
	
	if countryResolvedCount > 0 {
		log.Printf("summary: resolved countries for %d/%d events", countryResolvedCount, len(a.events))
	} else if len(a.events) > 0 {
		log.Printf("summary: WARNING - no countries resolved for %d events (resolver: %s)", len(a.events), resolverStatus)
	}

	// Convert maps to sorted slices for top items
	topBrowsers := topNFromMap(byBrowser, 10)
	topPlatforms := topNFromMap(byPlatform, 10)

	// Convert to map format for JSON
	byBrowserMap := make(map[string]uint64)
	for _, item := range topBrowsers {
		byBrowserMap[item.Key] = item.Count
	}

	byPlatformMap := make(map[string]uint64)
	for _, item := range topPlatforms {
		byPlatformMap[item.Key] = item.Count
	}

	return SummarySnapshot{
		Since: a.startedAt,
		Total: a.total,
		Stats: SummaryStats{
			Visitors:  visitorCount,
			Pageviews: int(a.total),
			Countries: len(uniqueCountries),
		},
		Aggregations: SummaryAggregations{
			ByCountry: byCountry,
			ByBrowser: byBrowserMap,
			ByPlatform: byPlatformMap,
		},
		TopPaths:  truncateTopItems(topNFromMap(a.perPath, 5)),
		TopIPs:    truncateTopItems(topNFromMap(a.perIP, 5)),
		TopStatus: topNFromIntMap(a.perStatus, 5),
	}
}

func topNFromMap(m map[string]uint64, n int) []TopItem {
	out := make([]TopItem, 0, len(m))
	for k, v := range m {
		out = append(out, TopItem{Key: k, Count: v})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Count > out[j].Count
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

func topNFromIntMap(m map[int]uint64, n int) []TopItem {
	tmp := make(map[string]uint64, len(m))
	for k, v := range m {
		tmp[http.StatusText(k)] = v
	}
	return topNFromMap(tmp, n)
}

// Batch sink: periodically sends events to internal route which uploads to S3.
func RunBatchSink(cfg *config.Config, in <-chan Event) {
	// Use internal route instead of external Next.js collector
	// Construct URL from FluentWebListen (e.g., "127.0.0.1:9811" -> "http://127.0.0.1:9811/internal/batch")
	internalURL := "http://" + cfg.FluentWebListen + "/internal/batch"
	
	client := &http.Client{Timeout: 10 * time.Second}
	flushInterval := cfg.FlushInterval()
	maxBatch := cfg.CollectorMaxBatchSize
	if maxBatch <= 0 {
		maxBatch = 500
	}
	log.Printf("batch sink using internal route %s interval=%s size=%d", internalURL, flushInterval, maxBatch)

	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	batch := make([]Event, 0, maxBatch)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		// Convert Event slice to []interface{} for JSON marshaling
		events := make([]interface{}, len(batch))
		for i, evt := range batch {
			events[i] = evt
		}
		
		payload := map[string]interface{}{
			"env":        cfg.Env,
			"instanceId": cfg.InstanceId,
			"siteId":     cfg.SiteId,
			"events":     events,
		}
		body, _ := json.Marshal(payload)
		log.Printf("batch sink: flushing %d events to %s", len(batch), internalURL)
		req, _ := http.NewRequest("POST", internalURL, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("batch sink error: %v", err)
		} else {
			if resp.StatusCode == http.StatusOK {
				log.Printf("batch sink: successfully sent %d events to internal route", len(batch))
			} else {
				// Read error response body for debugging
				respBody, _ := io.ReadAll(resp.Body)
				log.Printf("batch sink error: status %d, response: %s", resp.StatusCode, string(respBody))
			}
			resp.Body.Close()
		}
		batch = batch[:0]
	}

	for {
		select {
		case evt := <-in:
			batch = append(batch, evt)
			if len(batch) >= maxBatch {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}
