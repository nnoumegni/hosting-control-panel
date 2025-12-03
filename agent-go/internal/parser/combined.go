package parser

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// This regex handles standard "combined" access logs used by Apache and Nginx.
// Example:
// 73.252.173.115 - - [16/Nov/2025:22:32:31 +0000] "GET / HTTP/1.1" 200 3460 "-" "Mozilla/5.0 ..."
var combinedRegex = regexp.MustCompile(`^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (\S+) "([^"]*)" "([^"]*)"`)

type Parsed struct {
	RemoteIP  string
	Timestamp time.Time
	Method    string
	Path      string
	Protocol  string
	Status    int
	Bytes     int64
	Referer   string
	UserAgent string
	Raw       string
}

func ParseCombined(line string) (*Parsed, error) {
	m := combinedRegex.FindStringSubmatch(line)
	if m == nil {
		return nil, nil
	}
	p := &Parsed{
		RemoteIP:  m[1],
		Referer:   m[6],
		UserAgent: m[7],
		Raw:       strings.TrimSpace(line),
	}

	// date like 16/Nov/2006:22:32:31 +0000
	ts, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[2])
	if err == nil {
		p.Timestamp = ts
	}

	req := m[3]
	parts := strings.SplitN(req, " ", 3)
	if len(parts) >= 2 {
		p.Method = parts[0]
		p.Path = parts[1]
	}
	if len(parts) == 3 {
		p.Protocol = parts[2]
	}

	if code, err := strconv.Atoi(m[4]); err == nil {
		p.Status = code
	}
	if m[5] != "-" {
		if n, err := strconv.ParseInt(m[5], 10, 64); err == nil {
			p.Bytes = n
		}
	}
	return p, nil
}
