package commands

import (
	"encoding/json"
	"log"
	"os/exec"
	"strings"
)

type CommandPayload struct {
	Command string            `json:"command"`
	Args    map[string]string `json:"args,omitempty"`
}

type CommandResult struct {
	Command string `json:"command"`
	Result  string `json:"result"`
	Error   string `json:"error,omitempty"`
}

func Handle(cmd CommandPayload) CommandResult {
	log.Printf("[ws] received command=%s args=%v", cmd.Command, cmd.Args)

	switch cmd.Command {
	case "ping":
		return CommandResult{
			Command: cmd.Command,
			Result:  "pong",
		}

	case "run_health_check":
		// Run basic health checks
		checks := []string{}
		
		// Check if agent process is running
		if _, err := exec.LookPath("jetcamer-agent"); err == nil {
			checks = append(checks, "agent_binary_found")
		}
		
		// Check systemd service status
		out, err := exec.Command("systemctl", "is-active", "jetcamer-agent").Output()
		if err == nil && strings.TrimSpace(string(out)) == "active" {
			checks = append(checks, "service_active")
		}
		
		result := "health_ok"
		if len(checks) == 0 {
			result = "health_unknown"
		}
		
		return CommandResult{
			Command: cmd.Command,
			Result:  result,
		}

	case "get_version":
		// Get agent version via HTTP endpoint
		out, err := exec.Command("curl", "-s", "http://127.0.0.1:9811/version").Output()
		if err != nil {
			return CommandResult{
				Command: cmd.Command,
				Result:  "unknown",
				Error:   err.Error(),
			}
		}
		
		var versionResp map[string]string
		if err := json.Unmarshal(out, &versionResp); err == nil {
			return CommandResult{
				Command: cmd.Command,
				Result:  versionResp["version"],
			}
		}
		
		return CommandResult{
			Command: cmd.Command,
			Result:  "unknown",
		}

	case "get_machine_id":
		// Get machine ID
		out, err := exec.Command("cat", "/etc/machine-id").Output()
		if err != nil {
			return CommandResult{
				Command: cmd.Command,
				Result:  "",
				Error:   err.Error(),
			}
		}
		
		return CommandResult{
			Command: cmd.Command,
			Result:  strings.TrimSpace(string(out)),
		}

	case "get_status":
		// Get service status
		out, err := exec.Command("systemctl", "status", "jetcamer-agent", "--no-pager", "-l").Output()
		if err != nil {
			return CommandResult{
				Command: cmd.Command,
				Result:  "",
				Error:   err.Error(),
			}
		}
		
		return CommandResult{
			Command: cmd.Command,
			Result:  string(out),
		}

	default:
		return CommandResult{
			Command: cmd.Command,
			Result:  "unknown_command",
			Error:   "command not recognized",
		}
	}
}

