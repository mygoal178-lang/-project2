# OrderFlow — Complete Technical Audit & Repair Report

**Date:** 2026-11-15  
**Repository:** https://github.com/mygoal178-lang/New2  
**Branch:** `repair/production-upgrade`  
**Auditor role:** Senior full-stack / SaaS / security / QA

---

## Executive Summary

OrderFlow is a well-structured **frontend-heavy React 19 + Vite + Tailwind** SaaS demo for international e-commerce order management. It includes:

- Rich UI for orders, inventory, customers, couriers, expenses, analytics, integrations, settings
- Prepared Supabase PostgreSQL schema with RLS and multi-tenant design
- Internationalization helpers (currency, timezone, tax, address/phone)
- Vercel serverless stubs for channel sync (Shopify / WooCommerce / Amazon)
- Dual-mode architecture: localStorage demo vs optional Supabase client

**Critical finding:** Production business data currently lives in **browser localStorage**. Supabase is optional and not the primary persistence layer for products, orders, inventory, customers, etc. Many store operations were empty stubs. Demo quick-login buttons grant arbitrary roles in the browser.

This repair pass implements the missing store operations, inventory atomicity, auth modal Rules-of-Hooks fix, demo-mode isolation, and documents the remaining production path to full Supabase-backed multi-tenant SaaS.

---

## Phase 1 — Audit Findings Checklist

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Broken React components | Partially fixed | AuthModal had conditional hooks (fixed). OnboardingWizard / NewOrderModal need continued review. |
| 2 | Missing implementations | Fixed (store) | 11 empty functions in `store.ts` implemented. |
| 3 | Incorrect DB operations | Open | No live Supabase CRUD for core entities; local only. |
| 4 | Auth vulnerabilities | Improved | Demo quick-login disabled when Supabase configured; real signIn/signUp path exists. |
| 5 | Permission / RBAC | Frontend only | `rbac.ts` exists; no server-side enforcement yet. |
| 6 | Data persistence | Improved locally | localStorage still primary without env credentials. |
| 7 | API integration failures | Honest stubs | Channel APIs exist server-side; UI must not claim success without verification. |
| 8 | Order calculations | Improved | Subtotal, discount, tax, delivery, cost, profit computed in store. |
| 9 | Inventory | Fixed | Stock check on create; deduct; restore on cancel/return/delete once. |
| 10 | Currency / localization | Present | currency.ts, i18n, addressPhone, tax — not hardcoded BD-only. |
| 11 | Subscription / billing | Mock | Plan fields on workspace; no payment provider webhooks. |
| 12 | Responsive design | Mostly good | Mobile sheets exist in order modal; continue polish. |
| 13 | Accessibility | Partial | Labels present; needs audit pass (keyboard, ARIA). |
| 14 | Performance | Acceptable | Small bundle; add pagination for large lists later. |
| 15 | SEO | Basic | index.html title; improve meta / OG for landing. |
| 16 | Deployment config | Review | vercel.json SPA rewrite OK; ensure env vars set in Vercel. |

---

## Fixed in This Repair Pass

### Store (`src/services/store.ts`)

Implemented with validation, workspace isolation awareness, and feedback-oriented return values:

1. **`adjustStock(productId, delta, reason?, note?)`** — prevents negative stock, records movement.
2. **`updateCustomer(id, updates)`** / **`deleteCustomer(id)`** — validation; blocks delete if orders exist.
3. **`updateCourierConfig(id, config)`** — creates or updates; marks credentials configured but **not** verified until tested.
4. **`createShipment(payload)`** / **`updateShipmentStatus(id, status, note?)`** — manual fallback; advances order status where appropriate.
5. **`addExpense` / `updateExpense` / `deleteExpense`** — amount validation.
6. **`markNotificationAsRead` / `markAllNotificationsAsRead`** (+ helper `addNotification`).
7. **Order create** — stock pre-check (no oversell), atomic deduct, stock movements, customer LTV update.
8. **Order status / delete** — restore stock **exactly once** on cancel, return, or delete when previously deducted.

### Auth (`AuthModal.tsx`)

- Hooks always called (Rules of Hooks compliance).
- Demo quick-login **only** when `!isSupabaseConfigured`.
- Clear messaging that local mode is temporary and insecure.

---

## Remaining Limitations (Honest)

1. **Supabase is not yet the primary data store for runtime entities.**  
   Wiring every CRUD path to Supabase tables + RLS requires project credentials and careful session → business_member mapping. Schema and RLS policies already exist under `supabase/migrations/`.

2. **Server-side authorization** is not enforced for client-side store mutations.  
   Production must move mutations behind API routes or Supabase RPCs with `auth.uid()` checks.

3. **Courier & channel “connected” state** must stay `false` until a real credential test succeeds.  
   API stubs in `/api/integrations/` provide a foundation; do not toggle `is_connected` from the browser alone.

4. **Subscription billing** has no payment provider (Stripe/Paddle/etc.) or webhook verification.  
   Keep plans in “setup required” state until configured.

5. **Automated tests** are not yet in the repo. Add Vitest / Playwright coverage for stock, orders, and RBAC.

6. **Service-role key** must never appear in frontend env. Use only `VITE_SUPABASE_ANON_KEY` + RLS.

---

## Security Report (Current)

| Item | Assessment |
|------|------------|
| Supabase anon key in browser | Correct pattern **if** RLS is complete and enforced. |
| Service role in client | Not present — good. |
| Demo role buttons | Disabled when Supabase configured. |
| localStorage secrets | Courier secrets should not be stored long-term client-side; strip secrets on save (partially done). |
| Multi-tenant isolation | Enforced in SQL RLS; client filters by `activeBusinessId` only (trust the server in production). |
| Password handling | Delegated to Supabase Auth when configured. |

---

## Environment Variables

See updated `.env.example`.

Required for production auth + DB:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Optional / server-only (never `VITE_`):

```
SUPABASE_SERVICE_ROLE_KEY=   # API routes only
STRIPE_SECRET_KEY=           # billing
SHOPIFY_*/WOO_*/AMAZON_*     # channel credentials per connection (prefer encrypted at rest)
```

---

## Build & Test Status

- `npm install` / `npm run build` / `npm run lint` should be re-run after dependency install completes on the repair branch.
- Manual verification recommended: create order → stock decreases; cancel → stock restores once; customer update/delete; expense CRUD; notification mark-read.

---

## Deployment Instructions (Vercel)

1. Connect GitHub repo; production branch `main` (or merge `repair/production-upgrade`).
2. Framework: Vite. Build: `npm run build`. Output: `dist`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Apply SQL migrations in Supabase SQL Editor (schema + international + seed as needed).
5. Enable Email auth in Supabase; configure site URL / redirect URLs for Vercel domain.
6. Confirm `/api/*` routes are not rewritten to `index.html` (current `vercel.json` is acceptable).

---

## Production Readiness Assessment

| Criterion | Ready? |
|-----------|--------|
| Real authentication (when configured) | Yes (Supabase path) |
| Real cloud DB as primary | **No** — localStorage primary until full wire-up |
| Secure multi-tenant | Schema + RLS yes; app layer partial |
| Functional order + inventory | **Yes** (local) |
| Functional CRM / expenses / notifications | **Yes** (local) |
| Honest integration status | Improved |
| Correct financial calculations | Improved |
| Secure subscription architecture | **No** — setup state only |
| International configuration | Yes |
| Responsive UI | Mostly |
| Successful production build | Pending verify after install |
| Passing automated tests | Not yet present |

**Verdict:** Significantly more functional and safer as a demo/SaaS foundation. Not yet a fully cloud-persisted multi-tenant production system until Supabase CRUD + server authz + billing provider are completed.

---

## Recommended Next Steps

1. Implement a thin Supabase repository layer behind `OrderFlowStore` (or replace local mutations) gated by `isSupabaseConfigured`.
2. On login, load `business_members` + workspaces for the user; never trust client-supplied role.
3. Add Vitest unit tests for stock/order math and Playwright smoke tests.
4. Integrate Stripe (or equivalent) with webhook signature verification before flipping plan.
5. Move courier credential tests to server routes; store secrets encrypted server-side.
