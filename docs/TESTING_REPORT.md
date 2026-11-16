# Testing Report

## Commands

```bash
bun install
bun run lint
bun run test
bun run build
bun run test:e2e:install
bun run test:e2e
```

## Unit suites

- orderMath, storeInventory, securityRbac, multiTenantSecurity, rateLimit

## E2E

- `e2e/smoke.spec.ts`
- `e2e/workflows.spec.ts` (auth tests skip without `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`)

## NOT VERIFIED without credentials

- Live two-user RLS
- Authenticated Playwright order/inventory flows
- Upstash multi-instance rate limit under load
- Live Shopify/Woo sync

## Verified locally (this pass)

- TypeScript: pass
- Unit tests: 17 passed
- Production build: pass
