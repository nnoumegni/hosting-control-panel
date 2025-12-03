#!/usr/bin/env bash
# Debug why the new binary isn't producing logs

echo "=== Debugging Binary Issue ==="
echo ""

# 1. Check if process is running
echo "1. Process status:"
PID=$(pgrep jetcamer-agent | head -1)
if [ -n "$PID" ]; then
    echo "   ✓ Process running: PID $PID"
    echo "   Started: $(ps -p $PID -o lstart=)"
    echo "   Memory: $(ps -p $PID -o rss= | awk '{printf "%.1f MB", $1/1024}')"
    echo "   CPU: $(ps -p $PID -o %cpu=)%"
else
    echo "   ❌ Process not running!"
fi
echo ""

# 2. Check error log
echo "2. Error log:"
sudo tail -n 50 /var/log/jetcamer-agent/agent-error.log 2>/dev/null || echo "   Error log file not found or empty"
echo ""

# 3. Check if binary exists and is executable
echo "3. Binary file check:"
BINARY="/opt/jetcamer-agent/jetcamer-agent"
if [ -f "$BINARY" ]; then
    echo "   ✓ Binary exists"
    echo "   Size: $(stat -c%s "$BINARY" | awk '{printf "%.1f MB", $1/1024/1024}')"
    echo "   Modified: $(stat -c%y "$BINARY")"
    echo "   Executable: $([ -x "$BINARY" ] && echo 'Yes' || echo 'No')"
    
    # Check if it's actually a Go binary
    if file "$BINARY" | grep -q "Go"; then
        echo "   ✓ Valid Go binary"
    else
        echo "   ⚠ Not a Go binary or corrupted"
    fi
else
    echo "   ❌ Binary not found!"
fi
echo ""

# 4. Check if binary contains our new code
echo "4. Checking for new code in binary:"
if [ -f "$BINARY" ]; then
    echo "   - Looking for 'cyber-agent-logs':"
    strings "$BINARY" | grep -q "cyber-agent-logs" && echo "      ✓ Found" || echo "      ❌ Not found"
    
    echo "   - Looking for 'internal/batch':"
    strings "$BINARY" | grep -q "internal/batch" && echo "      ✓ Found" || echo "      ❌ Not found"
    
    echo "   - Looking for 'S3Uploader':"
    strings "$BINARY" | grep -q "S3Uploader\|s3upload" && echo "      ✓ Found" || echo "      ❌ Not found"
    
    echo "   - Looking for 'batch sink disabled':"
    strings "$BINARY" | grep -q "batch sink disabled" && echo "      ⚠ Found (OLD CODE)" || echo "      ✓ Not found (good - means new code)"
fi
echo ""

# 5. Try to run binary directly (test mode)
echo "5. Testing binary directly:"
echo "   Attempting to run with --help or -h (if supported):"
timeout 2 "$BINARY" --help 2>&1 | head -5 || echo "   Binary doesn't support --help or timed out"
echo ""

# 6. Check systemd service logs for any errors
echo "6. Systemd service errors:"
sudo journalctl -u jetcamer-agent --since "1 hour ago" --no-pager | grep -iE "error|failed|exit|signal" | tail -10 || echo "   No errors found"
echo ""

# 7. Check if there are any core dumps
echo "7. Checking for crashes:"
if [ -f /var/log/syslog ]; then
    sudo grep -i "jetcamer-agent.*segfault\|jetcamer-agent.*killed\|jetcamer-agent.*core" /var/log/syslog | tail -5 || echo "   No crash logs found"
else
    echo "   syslog not available"
fi
echo ""

# 8. Manual test - try running the binary in foreground
echo "8. Manual test (this will timeout after 3 seconds):"
echo "   Running binary directly to see immediate output:"
timeout 3 "$BINARY" 2>&1 | head -20 || echo "   Binary exited or timed out"
echo ""

echo "=== Debug Complete ==="
echo ""
echo "If binary contains old code, you need to rebuild and redeploy."
echo "If binary crashes, check the error messages above."

