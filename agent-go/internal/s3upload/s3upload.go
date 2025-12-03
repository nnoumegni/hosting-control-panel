package s3upload

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

const (
	bucketName = "cyber-agent-logs"
	machineIDPath = "/etc/machine-id"
)

type S3Uploader struct {
	client    *s3.Client
	machineID string
	bucketName string
	region    string
}

// NewS3Uploader creates a new S3 uploader instance
func NewS3Uploader(ctx context.Context) (*S3Uploader, error) {
	var cfg aws.Config
	var err error
	var region string

	// Check if stored credentials are available (first priority)
	storedCreds := GetStoredCredentials()
	if storedCreds != nil {
		// Use stored credentials
		region = storedCreds.Region
		if region == "" {
			// Try to get region from EC2 if not provided
			region = getRegionFromEC2Metadata(ctx)
		}
		if region == "" {
			return nil, fmt.Errorf("AWS region is required when using stored credentials")
		}
		
		// Create config with static credentials
		cfg, err = config.LoadDefaultConfig(ctx,
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				storedCreds.AccessKeyID,
				storedCreds.SecretAccessKey,
				"",
			)),
			config.WithRegion(region),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to load AWS config with stored credentials: %w", err)
		}
		log.Printf("S3 uploader using stored AWS credentials with region: %s", region)
	} else {
		// Use default credential chain
		cfg, err = config.LoadDefaultConfig(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to load AWS config: %w", err)
		}

		// Get region from config
		region = cfg.Region
		if region == "" {
			// Try to get from environment
			if envRegion := os.Getenv("AWS_REGION"); envRegion != "" {
				region = envRegion
			} else if envRegion := os.Getenv("AWS_DEFAULT_REGION"); envRegion != "" {
				region = envRegion
			} else {
				// Try to get region from EC2 instance metadata
				region = getRegionFromEC2Metadata(ctx)
			}
		}
		
		// If region is still empty, set it in config
		if region != "" && cfg.Region == "" {
			cfg.Region = region
		}
	}
	
	// Validate region format (basic check)
	if region == "" {
		return nil, fmt.Errorf("AWS region is not configured. Set AWS_REGION environment variable or configure AWS credentials file")
	}
	if len(region) > 20 {
		return nil, fmt.Errorf("invalid AWS region format: %q (must be 1-20 characters)", region)
	}
	
	log.Printf("S3 uploader using AWS region: %s", region)

	// Read machine-id
	machineID, err := readMachineID()
	if err != nil {
		return nil, fmt.Errorf("failed to read machine-id: %w", err)
	}

	uploader := &S3Uploader{
		client:    s3.NewFromConfig(cfg),
		machineID: machineID,
		bucketName: bucketName,
		region:    region,
	}

	// Ensure bucket exists
	if err := uploader.ensureBucket(ctx); err != nil {
		return nil, fmt.Errorf("failed to ensure bucket exists: %w", err)
	}

	log.Printf("S3 uploader initialized: bucket=%s machine-id=%s", bucketName, machineID)
	return uploader, nil
}

// readMachineID reads the machine-id from /etc/machine-id
func readMachineID() (string, error) {
	data, err := os.ReadFile(machineIDPath)
	if err != nil {
		return "", err
	}
	machineID := strings.TrimSpace(string(data))
	if machineID == "" {
		return "", fmt.Errorf("machine-id file is empty")
	}
	return machineID, nil
}

// GetMachineID is a public function to get the machine ID (for API access)
func GetMachineID() (string, error) {
	return readMachineID()
}

// ensureBucket creates the bucket if it doesn't exist
func (u *S3Uploader) ensureBucket(ctx context.Context) error {
	// Check if bucket exists
	_, err := u.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(u.bucketName),
	})
	if err == nil {
		// Bucket exists
		return nil
	}

	// Try to create the bucket
	log.Printf("bucket %s does not exist, creating in region %s...", u.bucketName, u.region)

	createInput := &s3.CreateBucketInput{
		Bucket: aws.String(u.bucketName),
	}

	// Set location constraint for regions other than us-east-1
	// us-east-1 is the default region and doesn't need a location constraint
	if u.region != "us-east-1" {
		// Validate region is a valid AWS region format
		if len(u.region) > 0 && len(u.region) < 20 {
			createInput.CreateBucketConfiguration = &types.CreateBucketConfiguration{
				LocationConstraint: types.BucketLocationConstraint(u.region),
			}
		} else {
			return fmt.Errorf("invalid AWS region: %s", u.region)
		}
	}

	_, err = u.client.CreateBucket(ctx, createInput)
	if err != nil {
		// Check if bucket was created by another process (race condition)
		var bucketAlreadyOwnedByYou *types.BucketAlreadyOwnedByYou
		if errors.As(err, &bucketAlreadyOwnedByYou) {
			log.Printf("bucket %s already exists (created by another process)", u.bucketName)
			return nil
		}
		// Check for other "already exists" errors
		if strings.Contains(err.Error(), "BucketAlreadyOwnedByYou") || 
		   strings.Contains(err.Error(), "BucketAlreadyExists") {
			log.Printf("bucket %s already exists", u.bucketName)
			return nil
		}
		return fmt.Errorf("failed to create bucket: %w", err)
	}

	log.Printf("bucket %s created successfully", u.bucketName)
	return nil
}

// UploadBatch uploads a batch of events as NDJSON to S3
func (u *S3Uploader) UploadBatch(ctx context.Context, events []interface{}) error {
	if len(events) == 0 {
		return nil
	}

	// Convert events to NDJSON format
	var ndjsonBuilder strings.Builder
	for _, event := range events {
		jsonBytes, err := json.Marshal(event)
		if err != nil {
			log.Printf("failed to marshal event: %v", err)
			continue
		}
		ndjsonBuilder.Write(jsonBytes)
		ndjsonBuilder.WriteString("\n")
	}

	ndjsonData := ndjsonBuilder.String()
	if ndjsonData == "" {
		return nil
	}

	// Generate S3 key: cyber-agent-logs/machine-id/timestamp-{random}.ndjson
	timestamp := time.Now().Format("2006-01-02T15-04-05")
	key := fmt.Sprintf("%s/%s-%d.ndjson", u.machineID, timestamp, time.Now().UnixNano())

	// Upload to S3
	_, err := u.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(u.bucketName),
		Key:         aws.String(key),
		Body:        bytes.NewReader([]byte(ndjsonData)),
		ContentType: aws.String("application/x-ndjson"),
	})

	if err != nil {
		return fmt.Errorf("failed to upload to S3: %w", err)
	}

	log.Printf("✓ uploaded batch to S3: s3://%s/%s (%d events, %d bytes)", 
		u.bucketName, key, len(events), len(ndjsonData))
	return nil
}

// UploadNDJSON uploads raw NDJSON data to S3
func (u *S3Uploader) UploadNDJSON(ctx context.Context, data io.Reader, size int64) error {
	timestamp := time.Now().Format("2006-01-02T15-04-05")
	key := fmt.Sprintf("%s/%s-%d.ndjson", u.machineID, timestamp, time.Now().UnixNano())

	_, err := u.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(u.bucketName),
		Key:         aws.String(key),
		Body:        data,
		ContentType: aws.String("application/x-ndjson"),
	})

	if err != nil {
		return fmt.Errorf("failed to upload NDJSON to S3: %w", err)
	}

	log.Printf("uploaded NDJSON to S3: s3://%s/%s", u.bucketName, key)
	return nil
}

// getRegionFromEC2Metadata queries EC2 instance metadata service for the region
func getRegionFromEC2Metadata(ctx context.Context) string {
	// First, try to get availability zone from metadata
	// The region is the AZ without the last letter (e.g., us-east-1a -> us-east-1)
	client := &http.Client{
		Timeout: 2 * time.Second,
	}
	
	// Try IMDSv2 (token-based)
	tokenURL := "http://169.254.169.254/latest/api/token"
	req, err := http.NewRequestWithContext(ctx, "PUT", tokenURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", "21600")
	
	resp, err := client.Do(req)
	if err != nil {
		// Fall back to IMDSv1
		return getRegionFromEC2MetadataV1(ctx, client)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return getRegionFromEC2MetadataV1(ctx, client)
	}
	
	tokenBytes := make([]byte, 64)
	n, _ := resp.Body.Read(tokenBytes)
	token := strings.TrimSpace(string(tokenBytes[:n]))
	
	if token == "" {
		return getRegionFromEC2MetadataV1(ctx, client)
	}
	
	// Use token to get availability zone
	azURL := "http://169.254.169.254/latest/meta-data/placement/availability-zone"
	req, err = http.NewRequestWithContext(ctx, "GET", azURL, nil)
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
	
	azBytes := make([]byte, 32)
	n, _ = resp.Body.Read(azBytes)
	az := strings.TrimSpace(string(azBytes[:n]))
	
	// Extract region from availability zone (remove last character)
	if len(az) > 1 {
		return az[:len(az)-1]
	}
	
	return ""
}

// getRegionFromEC2MetadataV1 tries IMDSv1 (no token required)
func getRegionFromEC2MetadataV1(ctx context.Context, client *http.Client) string {
	azURL := "http://169.254.169.254/latest/meta-data/placement/availability-zone"
	req, err := http.NewRequestWithContext(ctx, "GET", azURL, nil)
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
	
	azBytes := make([]byte, 32)
	n, _ := resp.Body.Read(azBytes)
	az := strings.TrimSpace(string(azBytes[:n]))
	
	// Extract region from availability zone (remove last character)
	if len(az) > 1 {
		return az[:len(az)-1]
	}
	
	return ""
}

