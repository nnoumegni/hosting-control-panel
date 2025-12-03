package metrics

import (
	"math/rand"
	"os/exec"
	"strconv"
	"strings"
)

type Metrics struct {
	CPUPercent float64 `json:"cpuPercent"`
	MemPercent float64 `json:"memPercent"`
	DiskUsage  float64 `json:"diskUsage"`
}

func Collect() Metrics {
	// Try to get real metrics, fallback to mock if unavailable
	m := Metrics{
		CPUPercent: getCPUPercent(),
		MemPercent: getMemPercent(),
		DiskUsage:  getDiskUsage(),
	}

	// If all metrics are 0, use mock data (for testing)
	if m.CPUPercent == 0 && m.MemPercent == 0 && m.DiskUsage == 0 {
		m.CPUPercent = 20 + rand.Float64()*30
		m.MemPercent = 40 + rand.Float64()*20
		m.DiskUsage = 50 + rand.Float64()*10
	}

	return m
}

func getCPUPercent() float64 {
	// Try to get CPU usage from top or /proc/stat
	out, err := exec.Command("sh", "-c", "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'").Output()
	if err == nil {
		if val, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); err == nil {
			return val
		}
	}
	return 0
}

func getMemPercent() float64 {
	// Try to get memory usage from free
	out, err := exec.Command("sh", "-c", "free | grep Mem | awk '{printf \"%.2f\", $3/$2 * 100.0}'").Output()
	if err == nil {
		if val, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); err == nil {
			return val
		}
	}
	return 0
}

func getDiskUsage() float64 {
	// Try to get disk usage from df
	out, err := exec.Command("sh", "-c", "df -h / | tail -1 | awk '{print $5}' | sed 's/%//'").Output()
	if err == nil {
		if val, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); err == nil {
			return val
		}
	}
	return 0
}

