package ws

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jetcamer/agent-go/internal/config"
	"github.com/jetcamer/agent-go/internal/s3upload"
)

var (
	manager     *Manager
	managerLock sync.RWMutex
)

// Manager manages the WebSocket client lifecycle
type Manager struct {
	cfg        *config.Config
	client     *Client
	ctx        context.Context
	cancel     context.CancelFunc
	started    bool
	mu         sync.Mutex
}

// GetManager returns the global WebSocket manager instance
func GetManager() *Manager {
	managerLock.RLock()
	defer managerLock.RUnlock()
	return manager
}

// InitManager initializes the global WebSocket manager
func InitManager(cfg *config.Config) {
	managerLock.Lock()
	defer managerLock.Unlock()
	
	if manager == nil {
		ctx, cancel := context.WithCancel(context.Background())
		manager = &Manager{
			cfg:    cfg,
			ctx:    ctx,
			cancel: cancel,
		}
	}
}

// TryStart attempts to start the WebSocket client if credentials are available
func (m *Manager) TryStart() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if we can get credentials and public IP
	secret := m.getSecret()
	apiURL := m.getAPIURL()

	if secret == "" || apiURL == "" {
		return false
	}

	// If already started, check if we need to restart (e.g., URL or secret changed)
	if m.started && m.client != nil {
		// Check if credentials/URL changed
		if m.client.secret != secret || m.client.apiURL != apiURL {
			// Stop old client
			if m.cancel != nil {
				m.cancel()
			}
			// Create new context
			ctx, cancel := context.WithCancel(context.Background())
			m.ctx = ctx
			m.cancel = cancel
			m.started = false
			m.client = nil
		} else {
			// Already started with same credentials
			return true
		}
	}

	// Create new context if needed
	if m.ctx == nil || m.cancel == nil {
		ctx, cancel := context.WithCancel(context.Background())
		m.ctx = ctx
		m.cancel = cancel
	}

	// Create client with current config
	client := &Client{
		cfg:     m.cfg,
		agentID: m.cfg.InstanceId,
		secret:  secret,
		apiURL:  apiURL,
	}

	m.client = client
	m.started = true

	// Start client in background
	go client.Start(m.ctx)
	log.Printf("[ws] WebSocket client started automatically (credentials available): connecting to %s", apiURL)

	return true
}

// Stop stops the WebSocket client
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.started {
		return
	}

	if m.cancel != nil {
		m.cancel()
	}
	m.started = false
	m.client = nil
	log.Printf("[ws] WebSocket client stopped")
}

// IsStarted returns whether the WebSocket client is currently running
func (m *Manager) IsStarted() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.started
}

// GetStatus returns detailed status information about the WebSocket client
func (m *Manager) GetStatus() map[string]interface{} {
	m.mu.Lock()
	defer m.mu.Unlock()

	status := map[string]interface{}{
		"started":    m.started,
		"hasClient":  m.client != nil,
		"hasContext": m.ctx != nil,
	}

	if m.client != nil {
		status["apiURL"] = m.client.apiURL
		status["agentID"] = m.client.agentID
		status["hasSecret"] = m.client.secret != ""
		status["hasConnection"] = m.client.conn != nil
	}

	// Check if credentials are available
	secret := m.getSecret()
	apiURL := m.getAPIURL()
	status["credentialsAvailable"] = secret != "" && apiURL != ""
	status["canStart"] = secret != "" && apiURL != ""

	if secret == "" {
		status["missing"] = "secret"
	} else if apiURL == "" {
		status["missing"] = "apiURL"
	}

	return status
}

// getSecret gets the secret from various sources
func (m *Manager) getSecret() string {
	// 1. Try config (manually set)
	if m.cfg.WsSecret != "" {
		return m.cfg.WsSecret
	}

	// 2. Try stored AWS credentials
	if storedCreds := s3upload.GetStoredCredentials(); storedCreds != nil && storedCreds.SecretAccessKey != "" {
		return storedCreds.SecretAccessKey
	}

	// 3. Try environment variable
	if secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY"); secretKey != "" {
		return secretKey
	}

	return ""
}

// getAPIURL gets the API URL, trying to detect public IP if needed
func (m *Manager) getAPIURL() string {
	// 1. Try config (manually set)
	if m.cfg.WsAPIURL != "" {
		return m.cfg.WsAPIURL
	}

	// 2. Try to detect public IP and construct URL
	if publicIP := config.GetPublicIP(); publicIP != "" {
		return "wss://" + publicIP + "/agent"
	}

	return ""
}

// StartMonitoring periodically checks for credentials and starts WebSocket if available
func (m *Manager) StartMonitoring(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-m.ctx.Done():
				return
			case <-ticker.C:
				if !m.IsStarted() {
					m.TryStart()
				}
			}
		}
	}()
}

