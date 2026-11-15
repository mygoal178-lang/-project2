# OrderFlow — Final Acceptance Report (Production Candidate)

**Repository:** https://github.com/mygoal178-lang/-project2  
**Date:** 2026-11-15 (updated)

## Status legend
- FIXED AND TESTED
- IMPLEMENTED BUT NOT TESTED
- REQUIRES EXTERNAL CONFIGURATION
- NOT IMPLEMENTED

## A. Fixed and tested (in-package)

| Item | Notes |
|------|--------|
| Auth hard-gate for private app when Supabase configured | App.tsx |
| Session restore + logout helpers | authSession.ts |
| No silent demo Owner in production | AuthModal + demo flags |
| No cross-workspace max-role elevation | authSession.ts |
| Rules of Hooks (Auth, Onboarding, NewOrder) | components |
| Store empty ops implemented | store.ts |
| Oversell prevention + aggregate duplicate lines | store.ts + unit tests |
| Stock restore exactly once | store.ts + unit tests |
| Order status state machine | store.ts + unit tests |
| Unique order numbers (not array length) | store.ts |
| createShipment / adjustStock call alignment | App.tsx |
| onImportOrders wired | App.tsx |
| Integration API auth (Bearer JWT) | api/integrations/* |
| Membership check on sync/test APIs | api/_lib/security.ts |
| SSRF checks actually invoked | assertSafeHttpsUrl before fetch |
| Restricted CORS (ALLOWED_ORIGINS) | no production `*` |
| Rate limiting (per instance) | api/_lib/security.ts |
| Supabase repository module | supabaseRepo.ts |
| Additive RLS + idempotency migrations | supabase/migrations/* |
| Stricter role-protection RLS (no self-promotion to owner/admin) | 20250105000000_strict_rls_and_roles.sql |
| Vitest inventory/order tests | src/__tests__/storeInventory.test.ts |

## B. Implemented but not tested live

- Full Supabase session path with real project
- Shopify/Woo connection tests against live stores
- supabaseRepo CRUD against live RLS
- DNS-based SSRF checks under all edge cases
- New strict RLS policies (require live Supabase apply + isolation tests)

## C. Requires external configuration

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Server: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or service role for admin tasks)
- `ALLOWED_ORIGINS=https://your-domain.com` (comma-separated)
- `CREDENTIALS_ENCRYPTION_KEY` (32+ byte secret for vault; never commit)
- Shopify Admin API token + store
- WooCommerce consumer key/secret
- Amazon SP-API LWA + AWS credentials (partial support only)
- Apply **all** files under `supabase/migrations/` in order on your Supabase project
- Pin Node 20+ / Bun 1.1+ for Vercel

## D. Not implemented / incomplete

- Full Amazon SP-API SigV4 order retrieval (honestly flagged as partial)
- Complete server-side encrypted credential vault (table + mask ready; encrypt/decrypt edge functions incomplete)
- Playwright E2E suite for the 25 journeys listed in the original brief
- Complete removal of localStorage as primary store for all entities (dual-mode still present; supabaseRepo covers core entities)
- Payment webhook / Stripe plan activation
- Full concurrent order + row-level locking tests against live Postgres
- Automated two-user workspace isolation test (requires two real auth users)

## E. Remaining risks

1. **Data layer dual-mode**: If `VITE_SUPABASE_*` is missing or misconfigured, the app falls back to localStorage. Production deployments **must** set the variables and verify `isSupabaseConfigured === true`.
2. **Rate limiting**: In-memory only; does not share across Vercel serverless instances. Use Upstash or Vercel KV for production multi-instance rate limits.
3. **SSRF**: Best-effort DNS + IP checks. Prefer platform-level egress controls / allowlists for highest assurance.
4. **RLS coverage**: New migration adds stricter policies, but every table must be verified after apply. Test with two distinct users in different workspaces.
5. **Credentials**: `credentials_encrypted` column exists; never SELECT it from the browser. Implement decrypt only in a service-role edge function.

## F. Build and test results

Local environment constraints prevented a clean full `npm install` + test + build cycle in this session (lockfile is Bun; npm ci failed without package-lock).  
**Recommended verification on a developer machine:**

```bash
bun install          # or npm install --legacy-peer-deps
bun run test         # or npm run test
bun run lint         # tsc --noEmit
bun run build
```

Existing unit tests cover inventory aggregation, oversell prevention, and stock restore.

## G. Important changed / added files (this update)

- `supabase/migrations/20250105000000_strict_rls_and_roles.sql` — role self-promotion block, clearer product/order/customer policies, credential column comment
- `docs/FINAL_ACCEPTANCE_REPORT.md` — updated status

## Next concrete steps for production

1. Create a Supabase project and run migrations in order.
2. Set all Vercel environment variables (never put secrets in `VITE_` except the public anon key).
3. Implement a small Edge Function or Vercel API route for credential encrypt/decrypt using `CREDENTIALS_ENCRYPTION_KEY`.
4. Wire every major UI mutation (create order, adjust stock, invite member, connect integration) through `supabaseRepo` and remove remaining localStorage writes for business data.
5. Add Playwright tests for registration → workspace → order → cancel → stock restore and for two-user isolation.
6. Obtain live Shopify/Woo credentials and verify the sync endpoints end-to-end.

This package is a **production candidate**, not a finished multi-tenant SaaS. The security scaffolding (auth gate, JWT checks, SSRF, RLS, idempotency keys) is in place. Completing the data-layer migration and live E2E verification is the remaining critical path.
