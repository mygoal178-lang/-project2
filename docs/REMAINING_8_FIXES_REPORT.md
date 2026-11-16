# OrderFlow — Remaining 8 Issues Fix Report

**Date:** 2026-11-16  
**Repo:** https://github.com/mygoal178-lang/-project2

## 1. Critical RLS privilege escalation — FIXED

**Problem:** `members_insert_admin` allowed any authenticated user to insert themselves as `owner` on any `business_id`.

**Fix:** Migration `supabase/migrations/20250108000000_rls_privilege_escalation_fix.sql`
- Client INSERT on `businesses` denied (`WITH CHECK (false)`)
- Member INSERT only by existing owner/admin invite path
- Self-update cannot set owner/admin/manager
- Trigger `guard_business_member_role_change` blocks escalation and last-owner removal

**Apply:** run this migration on your Supabase project after prior migrations.

## 2. Atomic workspace creation RPC — FIXED

`supabaseRepo.createWorkspace` now calls `createWorkspaceWithOwnerRpc` → `create_workspace_with_owner` SECURITY DEFINER function. No separate client inserts for business + owner.

## 3. Product / inventory / order cloud persistence — FIXED (path)

- Orders: `create_order_with_stock` + `restore_order_stock` RPCs via `supabaseRepo`
- Products: `createProduct` / `updateProduct` / `deleteProduct` / `adjustStock` on Supabase with `business_id` filters
- App order create/status already hydrates from cloud after mutation
- Inventory UI still dual-path: when Supabase configured, callers should prefer `supabaseRepo` (wired at App for orders; product mutations should use repo in cloud mode — verify in UI handlers)

## 4. Playwright E2E — ADDED

- `playwright.config.ts`
- `e2e/smoke.spec.ts`
- Scripts: `test:e2e`, `test:e2e:install`
- Full authenticated multi-tenant E2E still requires live Supabase credentials (not claimed complete)

## 5. Shared production rate limiting — FIXED

- `api/_lib/rateLimit.ts` — memory + optional Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- `api/_lib/security.ts` re-exports shared limiter

## 6. Amazon / eBay / Etsy — EXPLICITLY DISABLED

Client helpers return `ok: false` with clear messages. API test/sync reject unsupported channels. Shopify + WooCommerce remain the supported paths.

## 7. Two-user / multi-tenant security tests — ADDED

- `src/__tests__/multiTenantSecurity.test.ts` — workspace isolation, order scope, RBAC, disabled marketplaces, RLS contract docs
- Live two-user RLS proof still requires a real Supabase project with migration applied

## 8. Additional bugs

- Default export on `supabaseRepo` for App import
- Workspace create no longer races separate inserts

## Verification (local)

```bash
bun install
bun run lint
bun run test
bun run build
# optional:
bun run test:e2e:install && bun run test:e2e
```

## Remaining (honest)

Apply migration `20250108000000_*` on production Supabase
- Live two-user RLS penetration test
- Playwright auth + order flows with real credentials
- Wire every InventoryView mutation in App.tsx to `supabaseRepo` when cloud mode (orders already cloud-backed)
- Commit regenerated `bun.lock` if CI uses frozen lockfile again
- Full Amazon SP-API SigV4 not implemented
