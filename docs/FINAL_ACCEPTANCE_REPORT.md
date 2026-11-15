# OrderFlow — Final Acceptance Report (Production Candidate)

**Repository:** https://github.com/mygoal178-lang/-project2  
**Last updated:** 2026-11-16

## A. Implemented in recent commits

| Item | Notes |
|------|--------|
| Cloud bootstrap on auth | `src/services/cloudBootstrap.ts` + App.tsx loads memberships, products, orders, customers, expenses, integrations |
| Role from **active** workspace only | Never max-role across workspaces |
| `hydrateCloud` on store | Replaces demo collections with Supabase data; no demo product seed for UUID workspaces |
| Atomic order + stock RPC | `create_order_with_stock` + `restore_order_stock` migration |
| App order create/status | Uses RPC via `supabaseRepo` when Supabase configured |
| Credential vault API | `api/integrations/credentials.ts` — AES-256-GCM, membership check, no plaintext return |
| No localStorage secrets | `channelIntegrations.ts` disables legacy secret storage; purge helper |
| Shopify / Woo test API | JWT + membership + SSRF + timeouts |
| Amazon / eBay / Etsy | Honestly reported as unfinished |
| GitHub Actions CI | `.github/workflows/ci.yml` — bun install, lint, test, build |
| Strict RLS migration | Role self-promotion blocked |

## B. Requires live configuration

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=     # credential vault upsert only
CREDENTIALS_ENCRYPTION_KEY=   # ≥32 chars
ALLOWED_ORIGINS=https://your-app.vercel.app
```

Apply **all** files under `supabase/migrations/` in order (including `20250106000000_atomic_order_stock_rpc.sql`).

## C. Still not complete

- Every inventory/product mutation path still has a local store fallback (demo)
- Playwright E2E suite
- Distributed rate limiting (in-memory only)
- Full Amazon SP-API SigV4
- eBay / Etsy connectors
- Live two-user RLS isolation proof in CI

## D. Verify on your machine

```bash
bun install
bun run lint
bun run test
bun run build
```

## E. Honest readiness

OrderFlow is a **strong production candidate**: auth gate, cloud bootstrap, atomic stock RPC, encrypted credential vault API, SSRF-hardened integration routes, and CI are in place.

It becomes customer-ready after you:
1. Apply migrations on Supabase
2. Set all env vars on Vercel
3. Run a two-user isolation smoke test
4. Connect a real Shopify or Woo store and verify sync
