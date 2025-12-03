package server

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"

	"github.com/jetcamer/agent-go/internal/config"
	"github.com/jetcamer/agent-go/internal/s3upload"
	"github.com/jetcamer/agent-go/internal/security"
	"github.com/jetcamer/agent-go/internal/sinks"
	"github.com/jetcamer/agent-go/internal/version"
	"github.com/jetcamer/agent-go/internal/ws"
)

// Run starts a small HTTP server on cfg.FluentWebListen exposing:
//  - GET /health
//  - GET /version (returns agent version)
//  - GET /live
//  - GET /live/summary
//  - GET /security
//  - GET /internal/get-machine-id (returns machine ID)
//  - PUT /internal/set-aws-config (sets AWS credentials)
//  - GET /internal/s3-validate (validates S3 configuration)
//  - GET /internal/ws-status (returns WebSocket client status)
//  - POST /internal/batch (internal route for batch uploads to S3)
func Run(cfg *config.Config, agg *sinks.Aggregator, sec *security.Engine, s3Uploader *s3upload.S3Uploader) {
	// Store s3Uploader in a way that allows lazy initialization
	var s3UploaderPtr *s3upload.S3Uploader = s3Uploader
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		v := version.Get()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"version": v,
		})
	})

	mux.HandleFunc("/live", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		snap := agg.Snapshot()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(snap)
	})

	mux.HandleFunc("/live/summary", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		summary := agg.Summary()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(summary)
	})

	mux.HandleFunc("/test-country", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		ip := r.URL.Query().Get("ip")
		if ip == "" {
			host, _, err := net.SplitHostPort(r.RemoteAddr)
			if err == nil {
				ip = host
			} else {
				ip = r.RemoteAddr
			}
		}
		
		result := map[string]interface{}{
			"ip": ip,
		}
		
		// Test country resolution if aggregator has resolver
		if agg != nil {
			testResult := agg.TestCountryResolution(ip)
			result["test"] = testResult
		} else {
			result["error"] = "aggregator is nil"
		}
		
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	})

	mux.HandleFunc("/security", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if sec == nil {
			w.WriteHeader(http.StatusOK)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"securityEnabled":false}`))
			return
		}
		snap := sec.Snapshot()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(snap)
	})

	// Internal route to get machine ID
	mux.HandleFunc("/internal/get-machine-id", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		
		machineID, err := s3upload.GetMachineID()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}
		
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"machineId": machineID,
		})
	})

	// Internal route to set AWS credentials
	mux.HandleFunc("/internal/set-aws-config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		
		// Read request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":"failed to read request body"}`))
			return
		}
		defer r.Body.Close()
		
		// Parse JSON payload
		var payload map[string]string
		if err := json.Unmarshal(body, &payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":"invalid JSON payload"}`))
			return
		}
		
		// Extract credentials
		accessKeyID := payload["AWS_ACCESS_KEY_ID"]
		secretAccessKey := payload["AWS_SECRET_ACCESS_KEY"]
		region := payload["AWS_REGION"]
		
		// Validate required fields
		if accessKeyID == "" || secretAccessKey == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required",
			})
			return
		}
		
		// Store credentials
		s3upload.SetStoredCredentials(accessKeyID, secretAccessKey, region)
		
		response := map[string]interface{}{
			"status": "ok",
			"message": "AWS credentials stored successfully",
		}
		
		// Try to start WebSocket client if credentials are now available
		if wsManager := ws.GetManager(); wsManager != nil {
			if wsManager.TryStart() {
				response["websocket"] = "started"
			}
		}
		if region != "" {
			response["region"] = region
		} else {
			response["warning"] = "AWS_REGION not provided, will attempt to detect from EC2 metadata"
		}
		
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
	})

	// Internal route for WebSocket status
	mux.HandleFunc("/internal/ws-status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		wsManager := ws.GetManager()
		if wsManager == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "WebSocket manager not initialized",
			})
			return
		}

		status := wsManager.GetStatus()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(status)
	})

	// Internal route for S3 configuration validation
	mux.HandleFunc("/internal/s3-validate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		
		ctx := r.Context()
		result := s3upload.ValidateS3Config(ctx)
		
		w.Header().Set("Content-Type", "application/json")
		if !result.Valid {
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			w.WriteHeader(http.StatusOK)
		}
		json.NewEncoder(w).Encode(result)
	})

	// Internal route for batch uploads to S3
	mux.HandleFunc("/internal/batch", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		
		// Try lazy initialization if uploader is nil but credentials are available
		if s3UploaderPtr == nil {
			// Check if stored credentials are available
			if s3upload.HasStoredCredentials() {
				log.Printf("S3 uploader not initialized, attempting lazy initialization with stored credentials...")
				ctx := r.Context()
				newUploader, err := s3upload.NewS3Uploader(ctx)
				if err != nil {
					log.Printf("lazy S3 uploader initialization failed: %v", err)
					w.WriteHeader(http.StatusInternalServerError)
					json.NewEncoder(w).Encode(map[string]string{
						"error": fmt.Sprintf("S3 uploader not initialized: %v. Use /internal/set-aws-config to configure credentials.", err),
					})
					return
				}
				s3UploaderPtr = newUploader
				log.Printf("S3 uploader initialized successfully with stored credentials")
			} else {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "S3 uploader not initialized. Configure AWS credentials via /internal/set-aws-config or ensure AWS credentials are available.",
				})
				return
			}
		}

		// Read request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":"failed to read request body"}`))
			return
		}
		defer r.Body.Close()

		// Parse JSON payload
		var payload map[string]interface{}
		if err := json.Unmarshal(body, &payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error":"invalid JSON payload"}`))
			return
		}

		// Extract events from payload
		events, ok := payload["events"].([]interface{})
		if !ok {
			// Try to handle array directly
			var eventsArray []interface{}
			if err := json.Unmarshal(body, &eventsArray); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error":"events field not found or invalid"}`))
				return
			}
			events = eventsArray
		}

		if len(events) == 0 {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ok","message":"no events to upload"}`))
			return
		}

		// Upload to S3
		ctx := r.Context()
		if err := s3UploaderPtr.UploadBatch(ctx, events); err != nil {
			log.Printf("failed to upload batch to S3: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"error":"failed to upload to S3"}`))
			return
		}

		response := map[string]interface{}{
			"status":   "ok",
			"uploaded": len(events),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
	})

	addr := cfg.FluentWebListen
	log.Printf("agent web server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Printf("agent web server exited: %v", err)
	}
}
