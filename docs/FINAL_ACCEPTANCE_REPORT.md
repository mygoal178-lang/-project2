# OrderFlow — Final Acceptance Report (Production Candidate)

**Package:** OrderFlow-SECURE-PRODUCTION.zip  
**Date:** 2026-11-15

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
| Vitest inventory/order tests | src/__tests__/storeInventory.test.ts |

## B. Implemented but not tested live

- Full Supabase session path with real project
- Shopify/Woo connection tests against live stores
- supabaseRepo CRUD against live RLS
- DNS-based SSRF checks under all edge cases

## C. Requires external configuration

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Server: `SUPABASE_URL`, `SUPABASE_ANON_KEY` or same VITE_ for serverless verify
- `ALLOWED_ORIGINS=https://your-domain`
- `CREDENTIALS_ENCRYPTION_KEY` for future vault encryption
- Shopify / WooCommerce / Amazon credentials
- Stripe (or other) for paid plans
- Apply all files under `supabase/migrations/`

## D. Not implemented

- Full Amazon SP-API SigV4 order retrieval (honest partial flag)
- Complete encrypted credential vault service (table ready; encrypt API not complete)
- Playwright E2E suite
- Full replacement of every localStorage write with Supabase in the UI layer (repo exists; store dual-mode still primary offline)
- Payment webhook plan activation

## E. Remaining risks

- Until UI mutations call supabaseRepo for every entity, production can still persist locally if misconfigured
- In-memory rate limits do not span multiple Vercel instances
- DNS rebinding is mitigated best-effort; prefer egress allowlists at the platform

## F. Commands to run

```bash
npm install
npm run test
npm run lint
npm run build
```

## G. Important changed files

- `src/lib/authSession.ts`, `src/App.tsx`, `src/services/store.ts`
- `src/services/repositories/supabaseRepo.ts`
- `api/_lib/security.ts`, `api/integrations/test.ts`, `api/integrations/sync.ts`
- `supabase/migrations/20250103000000_security_hardening.sql`
- `supabase/migrations/20250104000000_orders_idempotency.sql`
- `src/__tests__/storeInventory.test.ts`
