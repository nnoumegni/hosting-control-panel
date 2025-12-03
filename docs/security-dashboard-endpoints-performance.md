# Security Dashboard API Endpoints Performance Analysis

**Date:** Generated automatically  
**Instance IP:** 54.214.70.207  
**Agent Port:** 9811  
**Base Path:** `/agent/requestlog`

## Executive Summary

The security dashboard makes **8 API calls** to load all data. When called in parallel (as the dashboard does), the total load time is approximately **~2 seconds**. However, all endpoints are currently in the **1.5-2 second range**, which is slower than ideal for a responsive user experience.

### Key Findings

- **All endpoints are moderate speed (1.5-2s)** - None are fast (<1s)
- **Total sequential time:** ~13.86 seconds
- **Total parallel time:** ~1.96 seconds (actual dashboard load time)
- **Largest data transfer:** ASN Distribution (119KB, 200 records)
- **Slowest endpoint:** ASN Distribution (1962ms avg)

## Endpoint Details

### 1. Dashboard Summary
- **Path:** `/agent/requestlog/dashboard/summary`
- **Query Parameters:** `days=7`
- **Purpose:** Main dashboard metrics (total requests, unique IPs, high-risk indicators, attacks/min, threat categories)
- **Performance:**
  - Average: **1601ms**
  - Min: 1533ms
  - Max: 1646ms
  - Response Size: 165 bytes
  - Records: 0 (aggregated data)
- **Status:** ⚠️ MODERATE (needs optimization)

### 2. Time Series (Hourly)
- **Path:** `/agent/requestlog/dashboard/timeseries`
- **Query Parameters:** `interval=hour&days=1`
- **Purpose:** Hourly time-series data for the timeline chart
- **Performance:**
  - Average: **1875ms**
  - Min: 1740ms
  - Max: 1949ms
  - Response Size: 1575 bytes
  - Records: 25
- **Status:** ⚠️ MODERATE (needs optimization)

### 3. Threat Categories
- **Path:** `/agent/requestlog/dashboard/threat-categories`
- **Query Parameters:** `days=7`
- **Purpose:** Threat category breakdown (brute_force, credential_stuffing, recon, etc.)
- **Performance:**
  - Average: **1773ms**
  - Min: 1619ms
  - Max: 1961ms
  - Response Size: 160 bytes
  - Records: 3
- **Status:** ⚠️ MODERATE (needs optimization)

### 4. Top Offenders
- **Path:** `/agent/requestlog/summary`
- **Query Parameters:** `minThreatScore=30&limit=20`
- **Purpose:** Top 20 high-threat IPs (minThreatScore: 30)
- **Performance:**
  - Average: **1606ms**
  - Min: 1595ms
  - Max: 1615ms
  - Response Size: 11759 bytes
  - Records: 20
- **Status:** ⚠️ MODERATE (needs optimization)

### 5. Country Distribution
- **Path:** `/agent/requestlog/summary`
- **Query Parameters:** `groupBy=country&limit=20&days=7`
- **Purpose:** Country grouping for geo heatmap
- **Performance:**
  - Average: **1842ms**
  - Min: 1651ms
  - Max: 2050ms
  - Response Size: 550 bytes
  - Records: 0 (grouped data)
- **Status:** ⚠️ MODERATE (needs optimization)

### 6. ASN Distribution ⚠️ SLOWEST
- **Path:** `/agent/requestlog/summary`
- **Query Parameters:** `limit=200&days=7`
- **Purpose:** IP summary for ASN aggregation (limit: 200)
- **Performance:**
  - Average: **1962ms** (SLOWEST)
  - Min: 1852ms
  - Max: 2035ms
  - Response Size: 119668 bytes (LARGEST)
  - Records: 200
- **Status:** ⚠️ MODERATE (highest priority for optimization)

### 7. CIDR Distribution
- **Path:** `/agent/requestlog/summary`
- **Query Parameters:** `groupBy=cidr&cidrMask=24&limit=20&days=7`
- **Purpose:** CIDR grouping for CIDR chart
- **Performance:**
  - Average: **1552ms** (FASTEST)
  - Min: 1462ms
  - Max: 1663ms
  - Response Size: 827 bytes
  - Records: 0 (grouped data)
- **Status:** ⚠️ MODERATE (best performing, but still needs improvement)

### 8. Log View (Default)
- **Path:** `/agent/requestlog/summary`
- **Query Parameters:** `limit=100&days=7`
- **Purpose:** Default log view data (limit: 100)
- **Performance:**
  - Average: **1646ms**
  - Min: 1559ms
  - Max: 1796ms
  - Response Size: 59393 bytes
  - Records: 100
- **Status:** ⚠️ MODERATE (needs optimization)

## Performance Analysis

### Timing Breakdown

| Endpoint | Avg (ms) | Min (ms) | Max (ms) | Data Size | Records |
|----------|----------|----------|----------|-----------|---------|
| ASN Distribution | 1962 | 1852 | 2035 | 119KB | 200 |
| Time Series | 1875 | 1740 | 1949 | 1.5KB | 25 |
| Country Distribution | 1842 | 1651 | 2050 | 550B | 0 |
| Threat Categories | 1773 | 1619 | 1961 | 160B | 3 |
| Log View | 1646 | 1559 | 1796 | 59KB | 100 |
| Top Offenders | 1606 | 1595 | 1615 | 11KB | 20 |
| Dashboard Summary | 1601 | 1533 | 1646 | 165B | 0 |
| CIDR Distribution | 1552 | 1462 | 1663 | 827B | 0 |

### Load Time Scenarios

- **Sequential (worst case):** ~13.86 seconds
- **Parallel (actual dashboard):** ~1.96 seconds
- **Target (ideal):** <500ms per endpoint, <1s total parallel

## Optimization Recommendations

### High Priority (Slowest Endpoints)

1. **ASN Distribution (1962ms)**
   - **Issue:** Largest data transfer (119KB) with 200 records
   - **Recommendation:**
     - Consider pagination or reducing default limit
     - Add database indexes on ASN fields
     - Implement caching for ASN lookups
     - Consider pre-aggregating ASN data

2. **Time Series (1875ms)**
   - **Issue:** Processing hourly aggregations
   - **Recommendation:**
     - Pre-aggregate time-series data in background jobs
     - Use materialized views or cached aggregations
     - Consider reducing time range or granularity

3. **Country Distribution (1842ms)**
   - **Issue:** Grouping operations on large dataset
   - **Recommendation:**
     - Pre-compute country aggregations
     - Add indexes on country field
     - Cache grouped results

### Medium Priority

4. **Threat Categories (1773ms)**
   - **Issue:** Category aggregation
   - **Recommendation:**
     - Pre-compute category counts
     - Cache category breakdowns

5. **Log View (1646ms)**
   - **Issue:** Large result set (100 records, 59KB)
   - **Recommendation:**
     - Implement pagination
     - Add database indexes on query fields
     - Consider reducing default limit

### General Optimization Strategies

1. **Database Optimization**
   - Add indexes on frequently queried fields (country, ASN, threatScore, timestamp)
   - Consider partitioning by date for time-series queries
   - Use materialized views for aggregations

2. **Caching**
   - Cache dashboard summary data (TTL: 30-60 seconds)
   - Cache country/ASN/CIDR distributions (TTL: 5 minutes)
   - Cache threat categories (TTL: 1 minute)

3. **Query Optimization**
   - Reduce data scanning by using proper WHERE clauses
   - Limit result sets before aggregation
   - Use database-specific aggregation functions

4. **Background Processing**
   - Pre-compute aggregations in background jobs
   - Update cached data asynchronously
   - Use incremental updates instead of full scans

5. **Response Optimization**
   - Compress large responses (gzip)
   - Remove unnecessary fields from responses
   - Consider streaming for large datasets

## Testing Script

A performance testing script is available at:
```
scripts/test-security-endpoints-performance.js
```

**Usage:**
```bash
node scripts/test-security-endpoints-performance.js [instanceId]
```

The script:
- Tests each endpoint 3 times
- Calculates average, min, and max response times
- Measures data size and record counts
- Provides optimization recommendations

## Target Performance Goals

| Endpoint Type | Current | Target | Priority |
|---------------|--------|--------|----------|
| Dashboard Summary | 1601ms | <500ms | High |
| Time Series | 1875ms | <500ms | High |
| Aggregations (Country/ASN/CIDR) | 1552-1962ms | <800ms | High |
| List Views (Top Offenders/Logs) | 1606-1646ms | <1000ms | Medium |

**Overall Goal:** Reduce parallel load time from ~2s to <1s

## Notes

- All endpoints are currently returning HTTP 200 (success)
- Response times are consistent (low variance)
- No timeouts or connection errors observed
- Data sizes are reasonable except for ASN Distribution (119KB)
- The dashboard makes all calls in parallel, so total load time is the slowest endpoint (~2s)

