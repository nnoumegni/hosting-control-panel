package logtail

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/jetcamer/agent-go/internal/config"
	"github.com/jetcamer/agent-go/internal/parser"
	"github.com/jetcamer/agent-go/internal/sinks"
)

// TailLogs autodiscovers Apache and Nginx access logs if cfg.LogPaths is empty.
// Otherwise, it tails the explicit paths.
func TailLogs(cfg *config.Config, cb func(sinks.Event)) error {
	var paths []string
	if len(cfg.LogPaths) > 0 {
		paths = append(paths, cfg.LogPaths...)
	} else {
		paths = discoverDefaultLogs()
	}
	if len(paths) == 0 {
		log.Printf("logtail: no log files discovered")
	}
	for _, p := range paths {
		p := p
		log.Printf("logtail: starting tail on %s", p)
		go tailFile(p, cb)
	}
	return nil
}

func discoverDefaultLogs() []string {
	candidates := []string{}

	// Apache Debian/Ubuntu style
	candidates = append(candidates, globDir("/var/log/apache2", "*access*.log")...)
	// Apache RHEL/CentOS style
	candidates = append(candidates, globDir("/var/log/httpd", "*access*.log")...)
	// Nginx
	candidates = append(candidates, globDir("/var/log/nginx", "*access*.log")...)

	seen := map[string]struct{}{}
	out := []string{}
	for _, p := range candidates {
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

func globDir(dir, pattern string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := []string{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		matched, _ := filepath.Match(pattern, name)
		if matched {
			out = append(out, filepath.Join(dir, name))
		}
	}
	return out
}

func tailFile(path string, cb func(sinks.Event)) {
	for {
		err := tailOnce(path, cb)
		if err != nil {
			log.Printf("logtail: error on %s: %v", path, err)
		}
		time.Sleep(2 * time.Second)
	}
}

func tailOnce(path string, cb func(sinks.Event)) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// seek to end (like tail -F)
	if _, err := f.Seek(0, os.SEEK_END); err != nil {
		log.Printf("logtail: seek error on %s: %v", path, err)
	}

	reader := bufio.NewReader(f)
	for {
		line, err := reader.ReadString('\n')
		if len(line) > 0 {
			parsed, _ := parser.ParseCombined(line)
			if parsed != nil {
				rawStr := parsed.Raw
				cb(sinks.Event{
					RemoteIP:  parsed.RemoteIP,
					Path:      parsed.Path,
					Method:    parsed.Method,
					Status:    parsed.Status,
					Bytes:     parsed.Bytes,
					UserAgent: parsed.UserAgent,
					Referer:   parsed.Referer,
					Timestamp: parsed.Timestamp,
					Raw:       &rawStr,
					Source:    filepath.Base(path),
				})
			}
		}
		if err != nil {
			time.Sleep(500 * time.Millisecond)
		}
	}
}
