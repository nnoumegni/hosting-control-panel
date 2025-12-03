# Security Dashboard Agent Bug Report

## Issue: Inconsistent Response Format for `groupBy=country`

### Summary
The agent's `/agent/requestlog/summary` endpoint with `groupBy=country` parameter returns inconsistent response formats. Sometimes it returns grouped data in the `groups` field, and sometimes it returns ungrouped data in the `results` field.

### Test Results
**Date:** 2025-11-21  
**Agent IP:** 54.214.70.207:9811  
**Test:** 10 consecutive requests (1 per second) to `/agent/requestlog/summary?groupBy=country&limit=20&days=7`

#### Country Endpoint Results:
- **Request 1-2:** Returned `results` field instead of `groups` field (0 groups)
- **Request 3-10:** Returned `groups` field correctly (18 groups each)
- **Inconsistency Rate:** 20% (2 out of 10 requests)

#### CIDR Endpoint Results:
- **All 10 requests:** Returned `groups` field correctly (20 groups each)
- **Inconsistency Rate:** 0% (all requests consistent)

### Root Cause
The agent's handling of `groupBy=country` is inconsistent. It appears to have a race condition or caching issue where:
1. Initial requests may return ungrouped data in `results` field
2. Subsequent requests return correctly grouped data in `groups` field

### Impact
- **User Experience:** Users see "No country data available" intermittently
- **Data Integrity:** Frontend cannot reliably display country distribution
- **Reliability:** Dashboard appears broken when agent returns wrong format

### Workaround (Frontend)
The frontend has been updated to:
1. Detect when agent returns `results` instead of `groups`
2. Log a warning to console
3. Return empty groups array to prevent showing wrong data
4. Display "No country data available" message

### Recommended Fix (Agent Side)
The agent should:
1. **Always return `groups` field** when `groupBy` parameter is provided
2. **Never return `results` field** when `groupBy` is specified
3. **Ensure consistent response format** across all requests
4. **Fix any race conditions** or caching issues that cause format inconsistency

### Test Script
A test script is available at `scripts/test-security-data-consistency.js` to validate agent consistency:

```bash
node scripts/test-security-data-consistency.js
```

### Related Files
- Frontend: `apps/web/app/(dashboard)/dashboard/security/page.tsx`
- Test Script: `scripts/test-security-data-consistency.js`

