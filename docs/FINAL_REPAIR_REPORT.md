# OrderFlow Final Repair Report

**Repository:** https://github.com/mygoal178-lang/-project2  
**Date:** 2026-11-16

## Problems discovered

1. `business_members` allowed self-owner INSERT (privilege escalation).
2. Workspace creation used non-atomic client inserts.
3. Inventory UI mutations could stay on local store in cloud mode.
4. Stock adjust was non-atomic (update + insert race).
5. Production rate limiting could silently use in-memory Map.
6. Playwright coverage was smoke-only.
7. Amazon/eBay/Etsy not fully implemented.
8. Demo store IDs could collide in the same millisecond.

## Problems fixed (in code)

1. Migration `20250108000000_rls_privilege_escalation_fix.sql`.
2. `createWorkspace` → `create_workspace_with_owner` RPC only.
3. App inventory create/update/delete/adjust → `supabaseRepo` when Supabase configured.
4. Migration `20250109000000_atomic_adjust_stock_rpc.sql` + repo uses `adjust_product_stock`.
5. Rate limiter fails closed in production without Upstash Redis.
6. Expanded E2E specs + rate limit unit tests.
7. Channel helpers reject amazon/ebay/etsy with clear messages.
8. Unique `uid()` for demo store entities.

## Remaining

- Apply migrations `20250108000000_*` and `20250109000000_*` on Supabase.
- Configure Upstash Redis for production rate limits.
- Live two-user RLS verification on real project.
- Full authenticated Playwright suite needs `E2E_USER_*` credentials.
- Amazon SP-API / eBay / Etsy full OAuth not implemented (disabled).
