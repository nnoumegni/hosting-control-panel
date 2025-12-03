# Caching Architecture Migration Guide

## ✅ Completed Migrations

### Components Using Caching Hooks

1. **Analytics Page** (`app/(dashboard)/dashboard/analytics/page.tsx`)
   - ✅ Migrated to use `useAnalytics()` hook
   - Benefits: Automatic caching, background refresh every 30s, SWR behavior

2. **Firewall Page** (`app/(dashboard)/dashboard/firewall/page.tsx`)
   - ✅ Migrated to use `useFirewallSettings()` hook
   - Benefits: Cache-first strategy, reduced API calls

### Available Custom Hooks

- `useAnalytics(instanceId)` - Analytics data with 30s refresh
- `useFirewallSettings()` - Firewall settings (cache-first)
- `useServerSettings()` - Server settings (cache-first)
- `useEc2Instances()` - EC2 instances list
- `useBillingOverview()` - Billing overview data

## 📋 Pending Migrations

### High Priority (Frequently Accessed, Read-Only)

1. **Monitoring Page** (`app/(dashboard)/dashboard/monitoring/page.tsx`)
   - Multiple endpoints: `monitoring/agents/online`, `monitoring/agents/{id}/heartbeat`, etc.
   - Strategy: Create `useMonitoringAgent()` hooks
   - Cache Policy: `REAL_TIME` or `METRICS`

2. **Domains Page** (`app/(dashboard)/dashboard/domains/page.tsx`)
   - Endpoints: `domains/dns/records/{domain}`, `domains/ssl/certificates`
   - Strategy: Create `useDomainRecords()`, `useSSLCertificates()` hooks
   - Cache Policy: `METRICS` or `HISTORICAL`

3. **Databases Page** (`app/(dashboard)/dashboard/databases/page.tsx`)
   - Endpoint: `databases`
   - Strategy: Create `useDatabases()` hook
   - Cache Policy: `METRICS`

4. **Email Page** (`app/(dashboard)/dashboard/email/page.tsx`)
   - Endpoint: `email/identities`
   - Strategy: Create `useEmailIdentities()` hook
   - Cache Policy: `METRICS`

### Medium Priority (Settings & Configuration)

5. **Server Settings** - Used in multiple places
   - Already has `useServerSettings()` hook
   - Need to migrate components using direct `apiFetch('settings/server')`

6. **AWS Rules** (`app/(dashboard)/dashboard/firewall/_components/aws-rules-tab.tsx`)
   - Endpoint: `firewall/aws-rules`
   - Strategy: Create `useAwsRules()` hook
   - Cache Policy: `REAL_TIME` (changes frequently)

### Low Priority (Write Operations)

- Components that only POST/PUT/DELETE don't need caching hooks
- But they can benefit from cache invalidation after mutations

## 🔧 How to Migrate a Component

### Before (Direct apiFetch)
```tsx
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);

useEffect(() => {
  const loadData = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<DataType>('endpoint/path');
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  loadData();
}, []);
```

### After (Using Caching Hook)
```tsx
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { CACHE_POLICIES } from '@/lib/cachePolicies';

const { data, isLoading, error, fromCache } = useCachedFetch<DataType>(
  'endpoint/path',
  {
    ...CACHE_POLICIES.METRICS,
    strategy: 'cache-first',
  }
);
```

### For Custom Hook
```tsx
// hooks/useMyData.ts
'use client';

import { useCachedFetch } from './useCachedFetch';
import { CACHE_POLICIES } from '../lib/cachePolicies';

export function useMyData(id: string | null) {
  const endpoint = id ? `my/endpoint/${id}` : null;
  
  return useCachedFetch<MyDataType>(
    endpoint || '',
    {
      ...CACHE_POLICIES.METRICS,
      enabled: !!id,
    }
  );
}
```

## 📊 Cache Policies

- **REAL_TIME**: 15s TTL, background refresh, SWR - For live data
- **METRICS**: 2min TTL, background refresh, SWR - For dashboard metrics
- **HISTORICAL**: 30min TTL, no background refresh - For historical data
- **STATIC**: 24h TTL, no background refresh - For rarely changing data

## 🎯 Best Practices

1. **Read-only endpoints** → Use caching hooks
2. **Frequently accessed data** → Use `REAL_TIME` or `METRICS` policy
3. **Settings/Config** → Use `cache-first` strategy
4. **After mutations** → Invalidate cache using `cacheManager.delete(endpoint)`
5. **Instance-specific data** → Pass instanceId as parameter to hook

## 🔄 Cache Invalidation

After POST/PUT/DELETE operations:
```tsx
import { cacheManager } from '@/lib/cacheManager';

// After successful mutation
await apiFetch('endpoint', { method: 'POST', ... });
await cacheManager.delete('endpoint'); // Invalidate cache
```

## 📝 Notes

- All hooks are SSR-safe (check for `window` before using IndexedDB)
- Cache works offline - shows stale data when network fails
- Multi-tab sync via BroadcastChannel
- Automatic cleanup of old entries (max 500 entries, LRU eviction)




