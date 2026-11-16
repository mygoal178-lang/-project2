# OrderFlow Security Audit

## Authentication
- Supabase Auth for production sessions.
- Default UI role is `staff` until active membership is applied.
- Demo role switch disabled when Supabase is configured.

## Authorization / RLS
- Membership helpers with SECURITY DEFINER and fixed `search_path`.
- Client cannot INSERT businesses; workspace bootstrap via RPC only.
- Member INSERT only by existing owner/admin.
- Trigger blocks self-promotion and last-owner removal.
- Business-scoped tables use `is_business_member(business_id)`.

## Secrets
- Integration credentials: server-side AES-256-GCM.
- Never select ciphertext secrets into the browser.
- No service role key in frontend.

## API
- JWT required on integration routes.
- Server RBAC and SSRF protections.
- Rate limiting: Upstash Redis required in production (fail closed).

## Residual risks
- Live RLS must be verified after migration apply.
- Without Upstash, production APIs deny until Redis is configured.
- Amazon/eBay/Etsy OAuth not implemented.
