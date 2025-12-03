#!/usr/bin/env bash
# Check logs from the most recent agent startup

echo "=== Checking Most Recent Agent Startup ==="
echo ""

# Get the most recent startup time
LAST_START=$(sudo systemctl show jetcamer-agent -p ActiveEnterTimestamp --value 2>/dev/null || echo "")
echo "Last service start: $LAST_START"
echo ""

# Get logs since the last start
echo "Logs since last startup:"
if [ -n "$LAST_START" ]; then
    sudo journalctl -u jetcamer-agent --since "$LAST_START" --no-pager
else
    sudo journalctl -u jetcamer-agent --since "10 minutes ago" --no-pager | grep -v "systemd\[1\]"
fi
echo ""

# Check if process is actually running the new binary
PID=$(pgrep jetcamer-agent | head -1)
if [ -n "$PID" ]; then
    echo "Current process info:"
    echo "  PID: $PID"
    echo "  Started: $(ps -p $PID -o lstart=)"
    echo "  Command: $(ps -p $PID -o cmd=)"
    echo "  Binary: $(readlink -f /proc/$PID/exe 2>/dev/null)"
    echo ""
    
    # Check if binary matches what's on disk
    DISK_BINARY="/opt/jetcamer-agent/jetcamer-agent"
    RUNNING_BINARY=$(readlink -f /proc/$PID/exe 2>/dev/null)
    if [ "$RUNNING_BINARY" = "$DISK_BINARY" ]; then
        echo "  ✓ Process is using the binary on disk"
        echo "  Binary modified: $(stat -c%y "$DISK_BINARY" 2>/dev/null)"
    else
        echo "  ⚠ Process binary doesn't match disk binary"
    fi
fi
echo ""

# Check for any output from the current process
echo "Any output from current process (PID $PID):"
sudo journalctl _PID=$PID --no-pager -n 50 2>/dev/null || echo "No logs found for this PID"
echo ""

