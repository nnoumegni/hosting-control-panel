package s3upload

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// StoredCredentials holds AWS credentials stored via API
type StoredCredentials struct {
	AccessKeyID     string
	SecretAccessKey string
	Region          string
}

const (
	credentialsFile = "/etc/jetcamer/aws-credentials.json"
)

var (
	storedCreds     *StoredCredentials
	storedCredsLock sync.RWMutex
)

// init loads stored credentials from disk on startup
func init() {
	loadStoredCredentialsFromDisk()
}

// SetStoredCredentials sets AWS credentials to be used as first priority
// Credentials are persisted to disk for persistence across restarts
func SetStoredCredentials(accessKeyID, secretAccessKey, region string) {
	storedCredsLock.Lock()
	defer storedCredsLock.Unlock()
	
	if accessKeyID != "" && secretAccessKey != "" {
		storedCreds = &StoredCredentials{
			AccessKeyID:     accessKeyID,
			SecretAccessKey: secretAccessKey,
			Region:          region,
		}
		// Persist to disk
		saveStoredCredentialsToDisk(storedCreds)
	} else {
		// Clear stored credentials if empty
		storedCreds = nil
		// Remove from disk
		removeStoredCredentialsFromDisk()
	}
}

// GetStoredCredentials returns the stored credentials (if any)
func GetStoredCredentials() *StoredCredentials {
	storedCredsLock.RLock()
	defer storedCredsLock.RUnlock()
	
	if storedCreds == nil {
		return nil
	}
	
	// Return a copy to avoid external modification
	return &StoredCredentials{
		AccessKeyID:     storedCreds.AccessKeyID,
		SecretAccessKey: storedCreds.SecretAccessKey,
		Region:          storedCreds.Region,
	}
}

// HasStoredCredentials returns true if credentials are stored
func HasStoredCredentials() bool {
	storedCredsLock.RLock()
	defer storedCredsLock.RUnlock()
	return storedCreds != nil
}

// loadStoredCredentialsFromDisk loads credentials from disk file
func loadStoredCredentialsFromDisk() {
	data, err := os.ReadFile(credentialsFile)
	if err != nil {
		// File doesn't exist or can't be read - that's okay
		return
	}

	var creds StoredCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		// Invalid JSON - ignore
		return
	}

	// Only load if both required fields are present
	if creds.AccessKeyID != "" && creds.SecretAccessKey != "" {
		storedCredsLock.Lock()
		storedCreds = &creds
		storedCredsLock.Unlock()
	}
}

// saveStoredCredentialsToDisk saves credentials to disk file
func saveStoredCredentialsToDisk(creds *StoredCredentials) {
	// Ensure directory exists
	dir := filepath.Dir(credentialsFile)
	if err := os.MkdirAll(dir, 0750); err != nil {
		// Log error but don't fail - credentials still work in memory
		return
	}

	data, err := json.Marshal(creds)
	if err != nil {
		return
	}

	// Write with restricted permissions (owner read/write only)
	if err := os.WriteFile(credentialsFile, data, 0600); err != nil {
		// Log error but don't fail - credentials still work in memory
		return
	}
}

// removeStoredCredentialsFromDisk removes the credentials file from disk
func removeStoredCredentialsFromDisk() {
	os.Remove(credentialsFile)
}

