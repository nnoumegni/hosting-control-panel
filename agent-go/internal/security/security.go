package security

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
)

//────────────────────────────────────────────────────────────
//  Types / Structs
//────────────────────────────────────────────────────────────

type Engine struct {
	cfg *Config

	mu sync.Mutex

	perIPMinute   map[string]int
	perPathMinute map[string]int
	perASNMinute  map[int]int

	bans    map[string]*SecurityEvent      // active bans
	history []SecurityEvent                // last 24h bans
	asn     *ASNResolver
	aws     *ec2.Client

	windowStart time.Time
}

// What each ban looks like
type SecurityEvent struct {
	IP        string    `json:"ip"`
	ASN       int       `json:"asn"`
	Path      string    `json:"path"`
	Reason    string    `json:"reason"`
	Count     int       `json:"count"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
}

// Config (matches agent.config.json)
type Config struct {
	SecurityEnabled         bool    `json:"securityEnabled"`
	SecurityMaxRpsPerIp     int     `json:"securityMaxRpsPerIp"`
	SecurityMaxRpmPerIp     int     `json:"securityMaxRpmPerIp"`
	SecurityMaxRpmPerPath   int     `json:"securityMaxRpmPerPath"`
	SecurityMaxRpmPerAsn    int     `json:"securityMaxRpmPerAsn"`
	SecurityBanMinutes      int     `json:"securityBanMinutes"`
	GeoLiteAsnPath          string  `json:"geoLiteAsnPath"`
	FirewallIpsetName       string  `json:"firewallIpsetName"`
	FirewallNftTable        string  `json:"firewallNftTable"`
	FirewallNftChain        string  `json:"firewallNftChain"`
	AwsRegion               string  `json:"awsRegion"`
	AwsNetworkAclId         string  `json:"awsNetworkAclId"`
	AwsNetworkAclDenyRuleBase int   `json:"awsNetworkAclDenyRuleBase"`
}

// Event from log parser
type LogEvent struct {
	IP     string
	Path   string
	Agent  string
	Time   time.Time
}

// Snapshot for /security endpoint
type SecuritySnapshot struct {
	Now               time.Time                 `json:"now"`
	ActiveBans        []*SecurityEvent          `json:"activeBans"`
	RecentBans        []SecurityEvent           `json:"recentBans"`
	WindowStart       time.Time                 `json:"windowStart"`
	PerIPMinute       map[string]int            `json:"perIpMinute"`
	PerPathMinute     map[string]int            `json:"perPathMinute"`
	PerASNMinute      map[int]int               `json:"perAsnMinute"`
	BanDurationMinutes int                      `json:"banDurationMinutes"`
}

//────────────────────────────────────────────────────────────
//  Engine initialization
//────────────────────────────────────────────────────────────

func NewEngine(cfg *Config) (*Engine, error) {
	e := &Engine{
		cfg:           cfg,
		perIPMinute:   make(map[string]int),
		perPathMinute: make(map[string]int),
		perASNMinute:  make(map[int]int),
		bans:          make(map[string]*SecurityEvent),
		history:       []SecurityEvent{},
		windowStart:   time.Now(),
	}

	// ASN Resolver
	if cfg.GeoLiteAsnPath != "" {
		e.asn = NewASNResolver(cfg.GeoLiteAsnPath)
	}

	// AWS Firewall
	if err := e.initAwsFirewall(cfg); err != nil {
		return nil, err
	}

	// Local firewall: ensure ipset + nftables exist
	if err := e.ensureLocalFirewall(); err != nil {
		return nil, err
	}

	// Start background loops
	go e.windowResetLoop()
	go e.expiryLoop()

	return e, nil
}

//────────────────────────────────────────────────────────────
//  AWS FIREWALL INIT
//────────────────────────────────────────────────────────────

func (e *Engine) initAwsFirewall(cfg *Config) error {
	if cfg.AwsRegion == "" || cfg.AwsNetworkAclId == "" {
		return nil // AWS firewall disabled
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(
		context.Background(),
		awsconfig.WithRegion(cfg.AwsRegion),
	)
	if err != nil {
		return err
	}

	e.aws = ec2.NewFromConfig(awsCfg)
	return nil
}

//────────────────────────────────────────────────────────────
//  LOCAL FIREWALL
//────────────────────────────────────────────────────────────

func (e *Engine) ensureLocalFirewall() error {
	ipset := e.cfg.FirewallIpsetName
	table := e.cfg.FirewallNftTable
	chain := e.cfg.FirewallNftChain

	// Ensure ipset exists
	exec.Command("ipset", "create", ipset, "hash:ip").Run()
	exec.Command("ipset", "create", ipset, "hash:ip").Run() // 2nd try silently

	// Ensure nft table exists
	exec.Command("nft", "add", "table", table).Run()

	// Ensure drop chain exists
	exec.Command("nft", "add", "chain", table, chain,
		"{ type filter hook prerouting priority -300; }").Run()

	// Ensure rule: drop if in ipset
	exec.Command("nft", "add", "rule", table, chain,
		fmt.Sprintf("ip saddr @%s drop", ipset)).Run()

	return nil
}

//────────────────────────────────────────────────────────────
//  PROCESS EVENTS
//────────────────────────────────────────────────────────────

func (e *Engine) Process(evt LogEvent) {
	if !e.cfg.SecurityEnabled {
		return
	}

	ip := strings.TrimSpace(evt.IP)
	if ip == "" || net.ParseIP(ip) == nil {
		return
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	// Update counters
	e.perIPMinute[ip]++
	e.perPathMinute[evt.Path]++

	var asn int
	if e.asn != nil {
		asn = e.asn.ASN(ip)
		if asn > 0 {
			e.perASNMinute[asn]++
		}
	}

	// Check thresholds
	if e.shouldBanIP(ip, evt.Path, asn) {
		e.applyBan(ip, evt.Path, asn)
	}
}

func (e *Engine) shouldBanIP(ip, path string, asn int) bool {
	cfg := e.cfg

	if cfg.SecurityMaxRpmPerIp > 0 && e.perIPMinute[ip] > cfg.SecurityMaxRpmPerIp {
		return true
	}

	if cfg.SecurityMaxRpmPerPath > 0 && e.perPathMinute[path] > cfg.SecurityMaxRpmPerPath {
		return true
	}

	if asn > 0 && cfg.SecurityMaxRpmPerAsn > 0 && e.perASNMinute[asn] > cfg.SecurityMaxRpmPerAsn {
		return true
	}

	return false
}

//────────────────────────────────────────────────────────────
//  APPLY BAN
//────────────────────────────────────────────────────────────

func (e *Engine) applyBan(ip, path string, asn int) {
	now := time.Now()

	ev := &SecurityEvent{
		IP:        ip,
		ASN:       asn,
		Path:      path,
		Reason:    "rate-limit",
		Count:     e.perIPMinute[ip],
		FirstSeen: now,
		LastSeen:  now,
	}

	e.bans[ip] = ev
	e.history = append(e.history, *ev)

	// local firewall
	exec.Command("ipset", "add", e.cfg.FirewallIpsetName, ip).Run()

	// AWS firewall?
	if e.aws != nil {
		go e.applyAwsBlock(ip)
	}
}

func (e *Engine) applyAwsBlock(ip string) {
	cfg := e.cfg

	rule := cfg.AwsNetworkAclDenyRuleBase + int(time.Now().Unix()%10000)

	_, _ = e.aws.CreateNetworkAclEntry(context.Background(), &ec2.CreateNetworkAclEntryInput{
		CidrBlock:      aws.String(fmt.Sprintf("%s/32", ip)),
		Egress:         aws.Bool(false),
		NetworkAclId:   aws.String(cfg.AwsNetworkAclId),
		Protocol:       aws.String("-1"),
		RuleAction:     types.RuleActionDeny,
		RuleNumber:     aws.Int32(int32(rule)),
	})
}

//────────────────────────────────────────────────────────────
//  BACKGROUND LOOPS
//────────────────────────────────────────────────────────────

func (e *Engine) windowResetLoop() {
	for {
		time.Sleep(1 * time.Minute)
		e.mu.Lock()
		e.perIPMinute = map[string]int{}
		e.perPathMinute = map[string]int{}
		e.perASNMinute = map[int]int{}
		e.windowStart = time.Now()
		e.mu.Unlock()
	}
}

func (e *Engine) expiryLoop() {
	for {
		time.Sleep(30 * time.Second)

		e.mu.Lock()
		cutoff := time.Now().Add(-time.Duration(e.cfg.SecurityBanMinutes) * time.Minute)

		for ip, ev := range e.bans {
			if ev.FirstSeen.Before(cutoff) {
				delete(e.bans, ip)
			}
		}

		// prune 24h history
		historyCut := time.Now().Add(-24 * time.Hour)
		newHist := []SecurityEvent{}
		for _, h := range e.history {
			if h.FirstSeen.After(historyCut) {
				newHist = append(newHist, h)
			}
		}
		e.history = newHist

		e.mu.Unlock()
	}
}

//────────────────────────────────────────────────────────────
//  SNAPSHOT FOR /security
//────────────────────────────────────────────────────────────

func (e *Engine) Snapshot() SecuritySnapshot {
	e.mu.Lock()
	defer e.mu.Unlock()

	active := []*SecurityEvent{}
	for _, ev := range e.bans {
		active = append(active, ev)
	}

	return SecuritySnapshot{
		Now:                time.Now(),
		ActiveBans:         active,
		RecentBans:         e.history,
		WindowStart:        e.windowStart,
		PerIPMinute:        e.perIPMinute,
		PerPathMinute:      e.perPathMinute,
		PerASNMinute:       e.perASNMinute,
		BanDurationMinutes: e.cfg.SecurityBanMinutes,
	}
}
