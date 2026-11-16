# Deployment Guide — Vercel + Supabase

## Supabase

1. Create project.
2. Run all SQL under `supabase/migrations/` in filename order.
3. Critical migrations:
   - `20250106000000_atomic_order_stock_rpc.sql`
   - `20250107000000_complete_rls_workspace_rbac.sql`
   - `20250108000000_rls_privilege_escalation_fix.sql`
   - `20250109000000_atomic_adjust_stock_rpc.sql`
4. Enable Email auth.
5. Copy Project URL and anon key.

## Vercel env

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
CREDENTIALS_ENCRYPTION_KEY=
ALLOWED_ORIGINS=https://your-app.vercel.app
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NODE_ENV=production
VITE_ENABLE_DEMO_MODE=false
```

## Post-deploy

1. Two users, two workspaces — isolation check.
2. Product → order → cancel (stock restore).
3. Shopify/Woo credentials only via encrypted API.
