package s3upload

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ValidationResult contains the result of S3 configuration validation
type ValidationResult struct {
	Valid           bool     `json:"valid"`
	Errors          []string `json:"errors,omitempty"`
	Warnings        []string `json:"warnings,omitempty"`
	Region          string   `json:"region,omitempty"`
	BucketExists    bool     `json:"bucketExists,omitempty"`
	MachineID       string   `json:"machineId,omitempty"`
	CredentialsType string   `json:"credentialsType,omitempty"`
}

// ValidateS3Config validates the S3 configuration without exposing sensitive data
func ValidateS3Config(ctx context.Context) ValidationResult {
	result := ValidationResult{
		Valid:    true,
		Errors:   []string{},
		Warnings: []string{},
	}

	// 1. Check machine-id
	machineID, err := readMachineID()
	if err != nil {
		result.Valid = false
		result.Errors = append(result.Errors, fmt.Sprintf("Cannot read machine-id from %s: %v", machineIDPath, err))
	} else {
		result.MachineID = machineID
	}

	// 2. Check AWS credentials and region
	var cfg aws.Config
	
	// Check if stored credentials are available (first priority)
	storedCreds := GetStoredCredentials()
	if storedCreds != nil {
		// Use stored credentials for validation
		region := storedCreds.Region
		if region == "" {
			region = getRegionFromEC2Metadata(ctx)
		}
		if region == "" {
			result.Valid = false
			result.Errors = append(result.Errors, "AWS region is required when using stored credentials")
			result.CredentialsType = "stored-credentials"
			return result
		}
		
		cfg, err = config.LoadDefaultConfig(ctx,
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				storedCreds.AccessKeyID,
				storedCreds.SecretAccessKey,
				"",
			)),
			config.WithRegion(region),
		)
		if err != nil {
			result.Valid = false
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to load AWS configuration with stored credentials: %v", err))
			result.CredentialsType = "stored-credentials"
			return result
		}
		result.CredentialsType = "stored-credentials"
	} else {
		// Use default credential chain
		cfg, err = config.LoadDefaultConfig(ctx)
		if err != nil {
			result.Valid = false
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to load AWS configuration: %v", err))
			return result
		}
	}

	// Determine credentials type (without exposing actual credentials)
	// Note: If stored credentials are set, credsType was already set above
	if result.CredentialsType == "" {
		credsType := "unknown"
		homeDir := os.Getenv("HOME")
		if homeDir == "" {
			homeDir = os.Getenv("USERPROFILE") // Windows fallback
		}
		
		if os.Getenv("AWS_ACCESS_KEY_ID") != "" {
			credsType = "environment-variables"
		} else if homeDir != "" {
			credsFile := homeDir + "/.aws/credentials"
			if _, err := os.Stat(credsFile); err == nil {
				credsType = "credentials-file"
			}
		}
		
		// Check for IAM role-based credentials (EC2, ECS, Lambda)
		if credsType == "unknown" {
			if os.Getenv("AWS_EXECUTION_ENV") != "" {
				credsType = "ecs-task-role"
			} else if os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
				credsType = "lambda-execution-role"
			} else {
				// Try to detect if we're on EC2
				if _, err := os.Stat("/sys/class/dmi/id/product_uuid"); err == nil {
					credsType = "ec2-instance-role"
				} else {
					credsType = "not-detected"
				}
			}
		}
		result.CredentialsType = credsType
	}

	// Check region
	region := cfg.Region
	if region == "" {
		// Try environment variables first
		if envRegion := os.Getenv("AWS_REGION"); envRegion != "" {
			region = envRegion
		} else if envRegion := os.Getenv("AWS_DEFAULT_REGION"); envRegion != "" {
			region = envRegion
		} else {
			// Try to get region from EC2 instance metadata
			region = getRegionFromEC2Metadata(ctx)
		}
	}

	if region == "" {
		result.Valid = false
		result.Errors = append(result.Errors, "AWS region is not configured. Set AWS_REGION environment variable or configure AWS credentials file")
	} else {
		// Validate region format
		if len(region) == 0 || len(region) > 20 {
			result.Valid = false
			result.Errors = append(result.Errors, fmt.Sprintf("Invalid AWS region format: %q (must be 1-20 characters)", region))
		} else {
			result.Region = region
		}
	}

	// 3. Test S3 client creation and bucket access
	if result.Region != "" {
		// Reload config with the detected region to ensure S3 client uses it
		var s3Cfg aws.Config
		if cfg.Region == "" {
			// Create new config with the detected region
			var err error
			s3Cfg, err = config.LoadDefaultConfig(ctx, config.WithRegion(result.Region))
			if err != nil {
				result.Warnings = append(result.Warnings, fmt.Sprintf("Failed to create AWS config with region %s: %v", result.Region, err))
				return result
			}
		} else {
			s3Cfg = cfg
		}
		client := s3.NewFromConfig(s3Cfg)

		// Try to check if bucket exists
		_, err := client.HeadBucket(ctx, &s3.HeadBucketInput{
			Bucket: aws.String(bucketName),
		})
		if err != nil {
			// Check if it's a credentials error
			errStr := err.Error()
			if strings.Contains(errStr, "NoCredentialProviders") || strings.Contains(errStr, "credentials") {
				result.Valid = false
				result.Errors = append(result.Errors, "AWS credentials not found or invalid. Configure AWS credentials via environment variables, credentials file, or IAM role")
			} else if strings.Contains(errStr, "NoSuchBucket") || strings.Contains(errStr, "NotFound") || strings.Contains(errStr, "404") {
				// Bucket doesn't exist - try to create it
				log.Printf("Bucket %s does not exist, creating...", bucketName)
				createInput := &s3.CreateBucketInput{
					Bucket: aws.String(bucketName),
				}
				
				// Set location constraint for regions other than us-east-1
				if result.Region != "" && result.Region != "us-east-1" {
					if len(result.Region) > 0 && len(result.Region) < 20 {
						createInput.CreateBucketConfiguration = &types.CreateBucketConfiguration{
							LocationConstraint: types.BucketLocationConstraint(result.Region),
						}
					}
				}
				
				_, createErr := client.CreateBucket(ctx, createInput)
				if createErr != nil {
					// Check if bucket was created by another process (race condition)
					var bucketAlreadyOwnedByYou *types.BucketAlreadyOwnedByYou
					if errors.As(createErr, &bucketAlreadyOwnedByYou) {
						log.Printf("Bucket %s already exists (created by another process)", bucketName)
						result.BucketExists = true
					} else if strings.Contains(createErr.Error(), "BucketAlreadyOwnedByYou") || strings.Contains(createErr.Error(), "BucketAlreadyExists") {
						log.Printf("Bucket %s already exists", bucketName)
						result.BucketExists = true
					} else if strings.Contains(createErr.Error(), "AccessDenied") || strings.Contains(createErr.Error(), "Forbidden") || strings.Contains(createErr.Error(), "403") {
						result.Valid = false
						result.Errors = append(result.Errors, fmt.Sprintf("Access denied: cannot create bucket %s. Check IAM permissions (s3:CreateBucket)", bucketName))
					} else {
						result.Valid = false
						result.Errors = append(result.Errors, fmt.Sprintf("Failed to create bucket %s: %v", bucketName, createErr))
					}
				} else {
					log.Printf("Bucket %s created successfully", bucketName)
					result.BucketExists = true
				}
			} else if strings.Contains(errStr, "AccessDenied") || strings.Contains(errStr, "Forbidden") || strings.Contains(errStr, "403") {
				result.Valid = false
				result.Errors = append(result.Errors, fmt.Sprintf("Access denied to bucket %s. Check IAM permissions (s3:HeadBucket, s3:CreateBucket, s3:PutObject)", bucketName))
			} else if strings.Contains(errStr, "Invalid region") || (strings.Contains(errStr, "DNS name") && strings.Contains(errStr, "region")) {
				// Only flag as invalid region if the error specifically mentions region
				result.Valid = false
				result.Errors = append(result.Errors, fmt.Sprintf("AWS SDK error with region %s: %v. Check that the region is correctly configured.", result.Region, err))
			} else {
				// For other errors, show as warning (might be temporary network issues, etc.)
				result.Warnings = append(result.Warnings, fmt.Sprintf("Cannot access bucket %s: %v", bucketName, err))
			}
		} else {
			result.BucketExists = true
		}
	}

	return result
}

