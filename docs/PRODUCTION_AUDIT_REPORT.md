# OrderFlow Production Audit Report

**Repository:** https://github.com/mygoal178-lang/-project2  
**Date:** 2026-11-16

## Issues addressed (12)

| # | Issue | Fix |
|---|--------|-----|
| 1 | Supabase RLS incomplete | `20250107000000_complete_rls_workspace_rbac.sql` — policies on profiles, businesses, members, products, orders, order_items, customers, inventory, expenses, shipments, invoices, notifications, audit, integrations |
| 2 | Profiles / business_members access | Own-profile SELECT/INSERT/UPDATE; members SELECT own + admin list; no self-promote to owner/admin |
| 3 | Multi-tenant isolation | All business tables gated by `is_business_member(business_id)` SECURITY DEFINER helpers |
| 4 | Workspace + owner membership | `create_workspace_with_owner` RPC creates business + owner row atomically |
| 5 | Server-side RBAC | `api/_lib/rbacServer.ts` + integration test requires manager+ |
| 6 | Role-switch permissions | Client role switch disabled when Supabase configured; role defaults to staff |
| 7 | Schema mismatches | Types remain international; store hydrate maps cloud fields; UUID workspaces skip demo seed |
| 8 | Order-processing RPCs | `create_order_with_stock` + `restore_order_stock` (prior migration) |
| 9 | Async channel import | App uses sequential `handleCreateOrder` with await path (cloud RPC) |
| 10 | localStorage session isolation | `storageScope.ts` + authSession sets per-user key prefix; cleared on logout |
| 11 | Fixed search_path | All SECURITY DEFINER helpers use `SET search_path = public` |
| 12 | Tests / CI | Inventory tests + `securityRbac.test.ts` + GitHub Actions CI |

## International support

- Workspace model: country, currency ISO, symbol, decimals, timezone (IANA), tax_config, address fields
- Orders: currency_code, tax_amount, shipping_address_json, country codes
- No forced Bangladesh-only defaults in cloud bootstrap (defaults USD/US only when unspecified)

## Remaining (honest)

- Live two-user RLS isolation test requires a real Supabase project
- Playwright E2E not present
- Amazon / eBay / Etsy not fully implemented
- In-memory rate limits are per-instance only
- Some inventory UI mutations still dual-mode (local store) when offline

## Deployment

1. Apply migrations in order under `supabase/migrations/`.
2. Set Vercel env:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIALS_ENCRYPTION_KEY`, `ALLOWED_ORIGINS`
3. `bun install && bun run lint && bun run test && bun run build`
4. Deploy to Vercel; confirm auth gate and workspace bootstrap with two test users.

## Verification commands

```bash
bun install
bun run lint
bun run test
bun run build
```
