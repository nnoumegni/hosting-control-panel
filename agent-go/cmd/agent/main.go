package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jetcamer/agent-go/internal/config"
	"github.com/jetcamer/agent-go/internal/logtail"
	"github.com/jetcamer/agent-go/internal/s3upload"
	"github.com/jetcamer/agent-go/internal/security"
	"github.com/jetcamer/agent-go/internal/server"
	"github.com/jetcamer/agent-go/internal/sinks"
	"github.com/jetcamer/agent-go/internal/version"
	"github.com/jetcamer/agent-go/internal/ws"
)

func main() {
	cfgPath := "/etc/jetcamer/agent.config.json"
	if env := os.Getenv("JETCAMER_AGENT_CONFIG"); env != "" {
		cfgPath = env
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	agentVersion := version.Get()
	mode := "dual-pipeline+webserver+security"
	if cfg.WsAPIURL != "" && cfg.WsSecret != "" {
		mode += "+websocket"
	}
	log.Printf("JetCamer agent starting version=%s mode=%s", agentVersion, mode)

	// live aggregator for /live
	agg := sinks.NewAggregator(2000)
	
	// Set up country resolver for summary endpoint
	// Try country path first, fallback to ASN path (though ASN DB typically doesn't have country data)
	countryDBPath := cfg.GeoLiteCountryPath
	if countryDBPath == "" {
		countryDBPath = cfg.GeoLiteASNPath
	}
	if countryDBPath != "" {
		countryResolver := security.NewCountryResolver(countryDBPath)
		agg.SetCountryResolver(countryResolver)
		log.Printf("country resolver initialized with database: %s", countryDBPath)
	} else {
		log.Printf("country resolver disabled (no GeoLite database path configured)")
	}

	// security engine
	var sec *security.Engine
	if cfg.SecurityEnabled {
		secCfg := &security.Config{
			SecurityEnabled:         cfg.SecurityEnabled,
			SecurityMaxRpsPerIp:     cfg.SecurityMaxRPSPerIP,
			SecurityMaxRpmPerIp:     cfg.SecurityMaxRPMPerIP,
			SecurityMaxRpmPerPath:   cfg.SecurityMaxRPMPerPath,
			SecurityMaxRpmPerAsn:    cfg.SecurityMaxRPMPerASN,
			SecurityBanMinutes:      cfg.SecurityBanMinutes,
			GeoLiteAsnPath:          cfg.GeoLiteASNPath,
			FirewallIpsetName:       cfg.FirewallIpsetName,
			FirewallNftTable:        cfg.FirewallNftTable,
			FirewallNftChain:        cfg.FirewallNftChain,
			AwsRegion:               cfg.AwsRegion,
			AwsNetworkAclId:         cfg.AwsNetworkAclId,
			AwsNetworkAclDenyRuleBase: cfg.AwsNetworkAclDenyRuleBase,
		}
		var err error
		sec, err = security.NewEngine(secCfg)
		if err != nil {
			log.Printf("failed to initialize security engine: %v", err)
			sec = nil
		}
	}

	// batch sink channel
	batchChan := make(chan sinks.Event, 100000)

	// Initialize S3 uploader for batch uploads
	ctx := context.Background()
	s3Uploader, err := s3upload.NewS3Uploader(ctx)
	if err != nil {
		log.Printf("WARNING: failed to initialize S3 uploader: %v (batch uploads will fail)", err)
		s3Uploader = nil
	}

	// start embedded web server exposing /live, /security, and /internal/batch
	go server.Run(cfg, agg, sec, s3Uploader)

	// start batch sink (to internal route → S3)
	go sinks.RunBatchSink(cfg, batchChan)

	// Initialize WebSocket manager (will auto-start when credentials are available)
	ws.InitManager(cfg)
	wsManager := ws.GetManager()
	
	// Try to start WebSocket client immediately if credentials are available
	if wsManager.TryStart() {
		log.Printf("WebSocket client started at startup")
	} else {
		log.Printf("WebSocket client will start automatically when credentials become available")
		// Start monitoring for credentials (check every 10 seconds)
		wsManager.StartMonitoring(10 * time.Second)
	}

	// tail logs, feed aggregator + security + batch
	go func() {
		err := logtail.TailLogs(cfg, func(evt sinks.Event) {
			// live analytics
			agg.Add(evt)
			// security analysis (rate limiting, DDoS patterns, ASN blocking)
			if sec != nil {
				sec.Process(security.LogEvent{
					IP:    evt.RemoteIP,
					Path:  evt.Path,
					Agent: evt.UserAgent,
					Time:  evt.Timestamp,
				})
			}
			// send to batch pipeline (for 24h+ history)
			select {
			case batchChan <- evt:
			default:
				// drop if batch channel is full
			}
		})
		if err != nil {
			log.Printf("log tailer exited with error: %v", err)
		}
	}()

	// wait for termination signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	s := <-sigCh
	log.Printf("received signal %s, shutting down...", s)
	
	// Stop WebSocket client
	if wsManager := ws.GetManager(); wsManager != nil {
		wsManager.Stop()
	}
	
	time.Sleep(1 * time.Second)
}
