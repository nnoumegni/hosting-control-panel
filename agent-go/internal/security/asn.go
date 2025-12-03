package security

import (
	"log"
	"net"
	"sync"

	"github.com/oschwald/geoip2-golang"
)

type ASNResolver struct {
	db   *geoip2.Reader
	lock sync.RWMutex
}

func NewASNResolver(path string) *ASNResolver {
	db, err := geoip2.Open(path)
	if err != nil {
		return &ASNResolver{db: nil}
	}
	return &ASNResolver{db: db}
}

func (r *ASNResolver) ASN(ip string) int {
	r.lock.RLock()
	defer r.lock.RUnlock()

	if r.db == nil {
		return 0
	}

	parsed := net.ParseIP(ip)
	if parsed == nil {
		return 0
	}

	record, err := r.db.ASN(parsed)
	if err != nil {
		return 0
	}

	return int(record.AutonomousSystemNumber)
}

func (r *ASNResolver) Close() error {
	r.lock.Lock()
	defer r.lock.Unlock()

	if r.db != nil {
		return r.db.Close()
	}
	return nil
}

// CountryResolver resolves country codes from IP addresses
type CountryResolver struct {
	db   *geoip2.Reader
	lock sync.RWMutex
}

func NewCountryResolver(path string) *CountryResolver {
	db, err := geoip2.Open(path)
	if err != nil {
		log.Printf("country resolver: failed to open database at %s: %v", path, err)
		return &CountryResolver{db: nil}
	}
	log.Printf("country resolver: successfully opened database at %s", path)
	return &CountryResolver{db: db}
}

func (r *CountryResolver) Country(ip string) string {
	r.lock.RLock()
	defer r.lock.RUnlock()

	if r.db == nil {
		return ""
	}

	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ""
	}

	// Try Country lookup (for GeoLite2-Country database)
	// Note: GeoLite2-ASN database typically doesn't have country data
	record, err := r.db.Country(parsed)
	if err == nil && record.Country.IsoCode != "" {
		return record.Country.IsoCode
	}

	// If Country() method fails, try City() method (GeoLite2-City includes country)
	cityRecord, err := r.db.City(parsed)
	if err == nil && cityRecord.Country.IsoCode != "" {
		return cityRecord.Country.IsoCode
	}

	return ""
}

func (r *CountryResolver) Close() error {
	r.lock.Lock()
	defer r.lock.Unlock()

	if r.db != nil {
		return r.db.Close()
	}
	return nil
}
