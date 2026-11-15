# OrderFlow Secure Production Package

This package includes authentication gates, Supabase repository scaffolding, secured integration APIs (JWT + membership + SSRF), inventory/order hardening, and automated Vitest coverage for stock rules.

Full matrix: `docs/FINAL_ACCEPTANCE_REPORT.md`

```bash
npm install
cp .env.example .env
npm run test
npm run build
npm run dev
```
