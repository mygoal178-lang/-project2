# OrderFlow Final Repair Report

**Date:** 2026-11-16  
**Repo:** https://github.com/mygoal178-lang/-project2

## Bundle size (verified locally)

| Metric | Before | After |
|--------|--------|-------|
| Main JS chunk | ~936 KB | ~360 KB |
| Code splitting | No | Yes (React.lazy views) |

## Fixed this pass

1. Membership immutability (`20250110000000`) — business_id/user_id immutable; last owner lock; invite RPC
2. Atomic order status (`20250111000000` transition_order_status)
3. Inventory production path via supabaseRepo in App.tsx (local verified)
4. API routes use async checkRateLimit + Retry-After
5. Currency honesty helpers (convertCurrencyDetailed) + optional live FX URL
6. React.lazy for major dashboard sections
7. Unit tests: 21 passed

## Apply on Supabase (in order)

- 20250108000000_rls_privilege_escalation_fix.sql
- 20250109000000_atomic_adjust_stock_rpc.sql
- 20250110000000_membership_immutability.sql
- 20250111000000_atomic_order_status_rpc.sql

## Verified locally

- TypeScript: pass
- Unit tests: 21 passed
- Production build: pass (~360KB main chunk)

## NOT VERIFIED (needs your credentials)

- Live two-user RLS against real Supabase
- Authenticated Playwright
- Upstash multi-instance rate limits
- Live exchange-rate API

## Env

See docs/DEPLOYMENT_GUIDE.md — UPSTASH_REDIS_*, CREDENTIALS_ENCRYPTION_KEY, SUPABASE_*, ALLOWED_ORIGINS.
