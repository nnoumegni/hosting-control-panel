package version

import (
	"os"
	"strings"
)

// Version is set at build time via -ldflags
// If not set, it will try to read from VERSION file
var Version = "dev"

func init() {
	// If version wasn't set at build time, try to read from VERSION file
	if Version == "dev" || Version == "" {
		if data, err := os.ReadFile("VERSION"); err == nil {
			Version = strings.TrimSpace(string(data))
		}
		// If still empty, use default
		if Version == "" {
			Version = "unknown"
		}
	}
}

// Get returns the version string
func Get() string {
	return Version
}

