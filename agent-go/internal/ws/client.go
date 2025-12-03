package ws

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"time"

	"github.com/jetcamer/agent-go/internal/commands"
	"github.com/jetcamer/agent-go/internal/config"
	"github.com/jetcamer/agent-go/internal/metrics"
	"github.com/jetcamer/agent-go/internal/version"
	"nhooyr.io/websocket"
)

type Client struct {
	cfg      *config.Config
	conn     *websocket.Conn
	agentID  string
	secret   string
	apiURL   string
}

func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg:     cfg,
		agentID: cfg.InstanceId,
		secret:  cfg.WsSecret,
		apiURL:  cfg.WsAPIURL,
	}
}

func (c *Client) Start(ctx context.Context) {
	if c.apiURL == "" || c.secret == "" {
		log.Printf("[ws] WebSocket client disabled (missing WsAPIURL or WsSecret in config)")
		return
	}

	go c.connectLoop(ctx)
}

func (c *Client) connectLoop(ctx context.Context) {
	var attempt int

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := c.connectOnce(ctx)
		if err != nil {
			log.Printf("[ws] connection closed: %v", err)
		}

		// Exponential backoff with max 60 seconds
		attempt++
		sleep := time.Duration(math.Min(60, math.Pow(2, float64(attempt)))) * time.Second
		log.Printf("[ws] reconnecting in %s (attempt %d)", sleep, attempt)
		
		select {
		case <-ctx.Done():
			return
		case <-time.After(sleep):
		}
	}
}

func (c *Client) connectOnce(ctx context.Context) error {
	log.Printf("[ws] connecting to %s (agentId=%s)", c.apiURL, c.agentID)

	wsCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	conn, resp, err := websocket.Dial(wsCtx, c.apiURL, nil)
	if err != nil {
		if resp != nil {
			log.Printf("[ws] connection failed: %v (status=%d)", err, resp.StatusCode)
		} else {
			log.Printf("[ws] connection failed: %v", err)
		}
		return err
	}
	defer conn.Close(websocket.StatusInternalError, "closing")

	c.conn = conn
	log.Printf("[ws] ✓ connected successfully to %s", c.apiURL)

	// Send auth message
	hostname := c.cfg.InstanceId
	if hostname == "" {
		hostname = "unknown"
	}
	
	authEnv := NewEnvelope(TypeAuth, c.agentID, AuthPayload{
		Hostname: hostname,
		Version:  version.Get(),
	})
	
	log.Printf("[ws] sending auth message (agentId=%s, version=%s)", c.agentID, version.Get())
	if err := c.send(authEnv); err != nil {
		log.Printf("[ws] failed to send auth message: %v", err)
		return err
	}
	log.Printf("[ws] ✓ auth message sent successfully")

	// Start loops
	errCh := make(chan error, 3)
	go c.readLoop(ctx, errCh)
	go c.metricsLoop(ctx, errCh)
	go c.heartbeatLoop(ctx, errCh)

	// Wait for any loop to error or context cancellation
	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-errCh:
		return err
	}
}

func (c *Client) send(env Envelope) error {
	if c.conn == nil {
		return nil
	}

	data, err := MarshalSigned(env, c.secret)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return c.conn.Write(ctx, websocket.MessageText, data)
}

func (c *Client) readLoop(ctx context.Context, errCh chan<- error) {
	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			errCh <- err
			return
		}

		var env Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			log.Printf("[ws] invalid message: %v", err)
			continue
		}

		log.Printf("[ws] received message: type=%s agentId=%s ts=%d", env.Type, env.AgentID, env.TS)

		switch env.Type {
		case TypeCommand:
			var cmd commands.CommandPayload
			b, _ := json.Marshal(env.Payload)
			if err := json.Unmarshal(b, &cmd); err != nil {
				log.Printf("[ws] invalid command payload: %v", err)
				continue
			}

			log.Printf("[ws] executing command: %s (args=%v)", cmd.Command, cmd.Args)
			result := commands.Handle(cmd)
			log.Printf("[ws] command result: %s (error=%v)", result.Result, result.Error)

			resp := NewEnvelope(TypeCommandResult, c.agentID, result)
			if err := c.send(resp); err != nil {
				log.Printf("[ws] send command_result failed: %v", err)
			} else {
				log.Printf("[ws] ✓ command_result sent successfully")
			}

		default:
			log.Printf("[ws] received message type=%s (payload=%v)", env.Type, env.Payload)
		}
	}
}

func (c *Client) metricsLoop(ctx context.Context, errCh chan<- error) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			errCh <- ctx.Err()
			return
		case <-ticker.C:
			m := metrics.Collect()
			env := NewEnvelope(TypeMetrics, c.agentID, m)
			if err := c.send(env); err != nil {
				log.Printf("[ws] failed to send metrics: %v", err)
				errCh <- err
				return
			}
			log.Printf("[ws] metrics sent: cpu=%.1f%% mem=%.1f%% disk=%.1f%%", m.CPUPercent, m.MemPercent, m.DiskUsage)
		}
	}
}

func (c *Client) heartbeatLoop(ctx context.Context, errCh chan<- error) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			errCh <- ctx.Err()
			return
		case <-ticker.C:
			env := NewEnvelope(TypeHeartbeat, c.agentID, map[string]string{"status": "alive"})
			if err := c.send(env); err != nil {
				log.Printf("[ws] failed to send heartbeat: %v", err)
				errCh <- err
				return
			}
			log.Printf("[ws] heartbeat sent")
		}
	}
}

// SendLog sends a log message to the WebSocket server
func (c *Client) SendLog(level, message, source string) {
	if c.conn == nil {
		return
	}

	env := NewEnvelope(TypeLog, c.agentID, LogPayload{
		Level:   level,
		Message: message,
		Source:  source,
	})

	if err := c.send(env); err != nil {
		log.Printf("[ws] failed to send log: %v", err)
	}
}

