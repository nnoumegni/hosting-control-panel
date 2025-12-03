package ws

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type MessageType string

const (
	TypeAuth          MessageType = "auth"
	TypeMetrics       MessageType = "metrics"
	TypeLog           MessageType = "log"
	TypeCommand       MessageType = "command"
	TypeCommandResult MessageType = "command_result"
	TypeHeartbeat     MessageType = "heartbeat"
)

type Envelope struct {
	Type      MessageType `json:"type"`
	AgentID   string      `json:"agentId"`
	TS        int64       `json:"ts"`
	Nonce     string      `json:"nonce"`
	Payload   interface{} `json:"payload"`
	Signature string      `json:"signature"`
}

type CommandPayload struct {
	Command string            `json:"command"`
	Args    map[string]string `json:"args,omitempty"`
}

type MetricsPayload struct {
	CPUPercent float64 `json:"cpuPercent"`
	MemPercent float64 `json:"memPercent"`
	DiskUsage  float64 `json:"diskUsage"`
}

type AuthPayload struct {
	Hostname string `json:"hostname"`
	Version  string `json:"version"`
}

type LogPayload struct {
	Level   string `json:"level"`
	Message string `json:"message"`
	Source  string `json:"source,omitempty"`
}

func NewEnvelope(t MessageType, agentID string, payload interface{}) Envelope {
	return Envelope{
		Type:    t,
		AgentID: agentID,
		TS:      time.Now().UnixMilli(),
		Nonce:   uuid.NewString(),
		Payload: payload,
	}
}

func signEnvelope(env *Envelope, secret string) error {
	// Copy without signature
	tmp := struct {
		Type    MessageType `json:"type"`
		AgentID string      `json:"agentId"`
		TS      int64       `json:"ts"`
		Nonce   string      `json:"nonce"`
		Payload interface{} `json:"payload"`
	}{
		Type:    env.Type,
		AgentID: env.AgentID,
		TS:      env.TS,
		Nonce:   env.Nonce,
		Payload: env.Payload,
	}

	b, err := json.Marshal(tmp)
	if err != nil {
		return err
	}

	h := hmac.New(sha256.New, []byte(secret))
	h.Write(b)
	env.Signature = hex.EncodeToString(h.Sum(nil))

	return nil
}

func MarshalSigned(env Envelope, secret string) ([]byte, error) {
	if err := signEnvelope(&env, secret); err != nil {
		return nil, err
	}
	return json.Marshal(env)
}

