package config

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jetcamer/agent-go/internal/s3upload"
)

type Config struct {
	LogPaths                  []string `json:"logPaths"`
	FluentWebListen           string   `json:"webListen"` // e.g. 127.0.0.1:9811

	// Batch collector (Next.js → S3)
	CollectorUrl              string   `json:"collectorUrl"`
	CollectorFlushIntervalSec int      `json:"collectorFlushIntervalSeconds"`
	CollectorMaxBatchSize     int      `json:"collectorMaxBatchSize"`
	Env                       string   `json:"env"`
	InstanceId                string   `json:"instanceId"`
	SiteId                    string   `json:"siteId"`
	CollectorApiKey           string   `json:"collectorApiKey"`

	// Security config
	SecurityEnabled           bool     `json:"securityEnabled"`
	SecurityMaxRPSPerIP       int      `json:"securityMaxRpsPerIp"`
	SecurityMaxRPMPerIP       int      `json:"securityMaxRpmPerIp"`
	SecurityMaxRPMPerPath     int      `json:"securityMaxRpmPerPath"`
	SecurityMaxRPMPerASN      int      `json:"securityMaxRpmPerAsn"`
	SecurityBanMinutes        int      `json:"securityBanMinutes"`

	// MaxMind ASN DB (optional)
	GeoLiteASNPath            string   `json:"geoLiteAsnPath"`
	// MaxMind Country/City DB (optional, for country resolution in /live/summary)
	GeoLiteCountryPath        string   `json:"geoLiteCountryPath"`

	// Local firewall (ipset + nftables)
	FirewallIpsetName         string   `json:"firewallIpsetName"`
	FirewallNftTable          string   `json:"firewallNftTable"`
	FirewallNftChain          string   `json:"firewallNftChain"`

	// AWS network-level blocking (NACL)
	AwsRegion                 string   `json:"awsRegion"`
	AwsNetworkAclId           string   `json:"awsNetworkAclId"`
	AwsNetworkAclDenyRuleBase int      `json:"awsNetworkAclDenyRuleBase"` // starting rule number (e.g. 200)

	// WebSocket client (optional, for real-time communication with API)
	WsAPIURL                  string   `json:"wsApiUrl"`   // e.g. wss://api.jetcamer.com/agent
	WsSecret                  string   `json:"wsSecret"`   // Shared secret for HMAC signing
}

func Load(path string) (*Config, error) {
	cfg := &Config{
		CollectorFlushIntervalSec: 10,
		CollectorMaxBatchSize:     500,
		Env:                       "prod",
		SiteId:                    "default",
		FluentWebListen:           "127.0.0.1:9811",
		SecurityEnabled:           true,
		SecurityMaxRPSPerIP:       50,
		SecurityMaxRPMPerIP:       2000,
		SecurityMaxRPMPerPath:     1000,
		SecurityMaxRPMPerASN:      5000,
		SecurityBanMinutes:        60,
		FirewallIpsetName:         "jetcamer_blacklist",
		FirewallNftTable:          "inet",
		FirewallNftChain:          "jetcamer_drop",
		AwsNetworkAclDenyRuleBase: 200,
	}
	f, err := os.Open(path)
	if err != nil {
		// no config file is still ok; use defaults
		return cfg, nil
	}
	defer f.Close()
	if err := json.NewDecoder(f).Decode(cfg); err != nil {
		return nil, err
	}
	if cfg.CollectorFlushIntervalSec <= 0 {
		cfg.CollectorFlushIntervalSec = 10
	}
	if cfg.CollectorMaxBatchSize <= 0 {
		cfg.CollectorMaxBatchSize = 500
	}
	if cfg.InstanceId == "" {
		cfg.InstanceId = detectInstanceId()
	}
	if strings.TrimSpace(cfg.FluentWebListen) == "" {
		cfg.FluentWebListen = "127.0.0.1:9811"
	}
	if cfg.SecurityBanMinutes <= 0 {
		cfg.SecurityBanMinutes = 60
	}
	if cfg.AwsNetworkAclDenyRuleBase <= 0 {
		cfg.AwsNetworkAclDenyRuleBase = 200
	}

	// Auto-configure WebSocket if not explicitly set
	if cfg.WsAPIURL == "" {
		// Try to get public IP and construct URL
		if publicIP := getPublicIP(); publicIP != "" {
			cfg.WsAPIURL = "wss://" + publicIP + "/agent"
		}
	}
	if cfg.WsSecret == "" {
		// Try to get AWS secret key
		cfg.WsSecret = getAWSSecretKey()
	}

	return cfg, nil
}

func (c *Config) FlushInterval() time.Duration {
	return time.Duration(c.CollectorFlushIntervalSec) * time.Second
}

func detectInstanceId() string {
	h, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return h
}

// GetPublicIP attempts to get the public IP address from EC2 metadata service
// Exported so it can be used by other packages
func GetPublicIP() string {
	return getPublicIP()
}

// getPublicIP attempts to get the public IP address from EC2 metadata service
func getPublicIP() string {
	// Try EC2 metadata service first (IMDSv2)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	client := &http.Client{Timeout: 2 * time.Second}

	// Try to get token for IMDSv2
	tokenURL := "http://169.254.169.254/latest/api/token"
	req, err := http.NewRequestWithContext(ctx, "PUT", tokenURL, nil)
	if err != nil {
		return getPublicIPV1(ctx, client)
	}
	req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", "21600")

	resp, err := client.Do(req)
	if err != nil {
		return getPublicIPV1(ctx, client)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return getPublicIPV1(ctx, client)
	}

	tokenBytes := make([]byte, 64)
	n, _ := resp.Body.Read(tokenBytes)
	token := strings.TrimSpace(string(tokenBytes[:n]))

	if token == "" {
		return getPublicIPV1(ctx, client)
	}

	// Use token to get public IP
	ipURL := "http://169.254.169.254/latest/meta-data/public-ipv4"
	req, err = http.NewRequestWithContext(ctx, "GET", ipURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("X-aws-ec2-metadata-token", token)

	resp, err = client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	ipBytes := make([]byte, 16)
	n, _ = resp.Body.Read(ipBytes)
	ip := strings.TrimSpace(string(ipBytes[:n]))

	return ip
}

// getPublicIPV1 tries IMDSv1 (no token required)
func getPublicIPV1(ctx context.Context, client *http.Client) string {
	ipURL := "http://169.254.169.254/latest/meta-data/public-ipv4"
	req, err := http.NewRequestWithContext(ctx, "GET", ipURL, nil)
	if err != nil {
		return ""
	}

	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	ipBytes := make([]byte, 16)
	n, _ := resp.Body.Read(ipBytes)
	ip := strings.TrimSpace(string(ipBytes[:n]))

	return ip
}

// getAWSSecretKey attempts to get AWS secret access key from various sources
func getAWSSecretKey() string {
	// 1. Try stored credentials (set via /internal/set-aws-config)
	if storedCreds := s3upload.GetStoredCredentials(); storedCreds != nil && storedCreds.SecretAccessKey != "" {
		return storedCreds.SecretAccessKey
	}

	// 2. Try environment variable
	if secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY"); secretKey != "" {
		return secretKey
	}

	// 3. Try AWS credentials file (~/.aws/credentials)
	// Note: We don't parse the credentials file here to avoid adding dependencies
	// The server should have access to this via the AWS SDK credential chain

	return ""
}
