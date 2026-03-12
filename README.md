This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase setup (Birthdays module)

The "Cargar cumpleanos del personal" section now uses Supabase through Next.js API routes.

1. Create `.env.local` from `.env.example`.
2. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. In Supabase SQL Editor, run:
   - `supabase/birthdays.sql`
   - If table already exists and you only need to update turno options: `supabase/birthdays_turno_guardia_larga.sql`
4. Restart dev server.

Notes:
- The app writes through server routes (`/api/birthdays`), not directly from browser to Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only.

## Auth + RBAC setup (Admin / Cliente)

This project now includes bootstrap auth with secure cookie session, OTP verification, password recovery by OTP and base roles.

1. Add these variables in `.env.local`:
   - `AUTH_SESSION_SECRET` (minimum 32 chars)
   - `AUTH_OTP_PEPPER` (optional)
   - `AUTH_ALLOW_DEV_OTP_FALLBACK` (optional: set `true` only if you want local OTP fallback instead of Brevo send when config is missing)
2. In Supabase SQL Editor, run:
   - `supabase/auth_rbac.sql`
3. Restart dev server.
4. Go to `/auth/login`:
   - If no users exist, the first signup creates an `ADMIN` account (bootstrap).
   - Public signup stays enabled and creates `CLIENTE` accounts by default.
   - "Olvide mi contrasena" allows requesting an OTP by e-mail and changing password after code validation.

Role behavior:
- `ADMIN`: full dashboard access.
- `CLIENTE`:
  - Can access `/anual` (calendario anual), `/mes/[month]` (calendario mensual) and `/mes/[month]/dia/[day]` (evento del dia).
  - Has read-only access in personal list.
  - Cannot upload/delete/replace monthly PDF efemerides.
  - Cannot access admin panels such as `/dashboard` or `/anual/email`.

Admin user management:
- `ADMIN` can review internal users directly from `/dashboard`.
- API used by this panel:
  - `GET /api/auth/admin-users` (list users)

Password recovery APIs:
- `POST /api/auth/request-password-reset` (request OTP for password change)
- `POST /api/auth/reset-password` (validate OTP + set new password)

Client access by shareable link/QR:
- `ADMIN` has a single permanent client access link/QR in `/dashboard/acceso-cliente`.
- API endpoint:
  - `GET /api/auth/client-access-link`
- Entry route used by the link:
  - `GET /acceso-cliente`
- The link signs in the visitor as a limited `CLIENTE` session and redirects to `/mes/{mesActual}/dia/{diaActual}`.

## E-mail recipients + Brevo test send (Phase 2)

To enable the `/anual/email` panel and test sends:

1. Add these variables in `.env.local`:
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
   - `BREVO_SENDER_NAME` (optional, default: `Calendario Garden`)
   - Ensure `AUTH_ALLOW_DEV_OTP_FALLBACK` is empty/false if you want to force real e-mail OTP delivery.
2. In Supabase SQL Editor, run:
   - `supabase/email_recipients.sql`
3. Restart dev server.
4. Go to `/anual/email`, add recipients, and click `Enviar prueba`.

Notes:
- Test sends are executed server-side via `POST /api/email-recipients/test`.
- Active recipients only can receive test sends from the panel.
- Optional test-only UI mode:
  - `NEXT_PUBLIC_EMAIL_PANEL_MODE=test`
  - Hides manual daily-run controls and run history in `/anual/email`.

## Daily notification run (Phase 3)

This project now includes a cron-ready endpoint:
- `GET /api/notifications/run-daily` (Vercel cron)
- `POST /api/notifications/run-daily` (manual trigger)

Setup:

1. Add these variables in `.env.local`:
   - `CRON_SECRET`
   - `APP_TIMEZONE` (optional, default: `America/Argentina/Buenos_Aires`)
   - `APP_BASE_URL` (optional, recommended for e-mail logo/assets. Example: `https://tu-dominio.com`)
   - `APP_LOGO_URL` (optional, full logo URL for e-mails. Example: `https://tu-dominio.com/media/iso_blanco.png`)
2. In Supabase SQL Editor, run:
   - `supabase/notification_logs.sql`
   - If the tables already exist and you only need to separate forced vs scheduled runs: `supabase/notification_logs_force_runs.sql`
3. Restart dev server.
4. Manual trigger example:

```bash
# Manual trigger (POST)
curl -X POST "http://localhost:3000/api/notifications/run-daily" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Cron-compatible trigger (GET)
curl "http://localhost:3000/api/notifications/run-daily" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Notes:
- The endpoint is idempotent by local date (`run_date`): it runs once per day.
- It logs each execution in `notification_runs` and each recipient result in `notification_deliveries`.
- It sends only when there are active recipients and events for the day.
- History endpoint for UI: `GET /api/notifications/history?limit=20`.
- If `APP_BASE_URL` is not configured, asset URLs in e-mails fallback to the request origin.
- If `APP_LOGO_URL` is configured, it is used as-is for the e-mail header logo.

### Vercel cron setup

This repo includes `vercel.json` with:
- path: `/api/notifications/run-daily`
- schedule: `0 10 * * *` (10:00 UTC, 07:00 in Argentina UTC-3)

On Vercel project settings:
1. Add environment variables:
   - `CRON_SECRET`
   - `APP_TIMEZONE`
   - `APP_BASE_URL`
   - `APP_LOGO_URL`
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
2. Redeploy.

Vercel cron requests use `GET` and include `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is configured.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
