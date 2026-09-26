# IT Helpdesk — Telegram Bot + Mini App

A production-ready internal IT ticketing system built as a Telegram Mini App,
backed by a Telegram bot for notifications and a Next.js + Supabase backend.

## What's implemented end-to-end

- **Telegram bot**: `/start`, `/help`, `/mytickets`, `/newticket`, `/support`,
  inline buttons, callback actions (Take / Confirm / Reopen), secure webhook
  (secret-token verified).
- **Telegram identity auth**: server-side `initData` HMAC validation
  (`lib/telegram/validateInitData.ts`) — the client's Telegram user id is
  never trusted directly; every request is re-validated server-side.
- **Mini App** (mobile-first, Telegram theme-aware): Employee home, 5-step
  ticket creation wizard, ticket list with tabs, full ticket detail +
  conversation + internal notes + technician actions, technician dashboard,
  admin dashboard, user management, asset registry, settings, help center,
  profile.
- **Ticket engine**: ticket numbering (`IT-2026-000123`), SLA due dates,
  status/priority changes with audit trail, take/assign, resolve → confirm →
  close, reopen, internal notes hidden from employees, file attachments
  (Supabase Storage, type/size validated).
- **Notifications**: every event in the spec (new ticket → IT group, assigned,
  replies, status change, resolved, reopened, critical → admins, SLA
  warning/breach) sent via the bot, matching the message formats you specified.
- **SLA sweep**: `/api/cron/sla-sweep`, wired to Vercel Cron every 10 minutes,
  sends warning/breach notifications exactly once per ticket per event type.
- **Database**: full schema in `supabase/schema.sql` — every table from the
  spec, indexes on hot paths, an RLS deny-by-default backstop (the app talks
  to Postgres exclusively via the service-role key, server-side).
- **Security**: Zod validation on every mutating route, role checks in
  `lib/permissions.ts` on every action, secrets never touch the client,
  generic "Something went wrong" errors to users with real errors logged
  server-side only.

## What's intentionally left as a starting point, not faked as complete

- **Reports/charts** (section 33) and the full **audit log viewer** (section
  34) — the data is already being recorded (`audit_logs`, and you can query
  `tickets`/`ticket_status_history` directly); building the charts UI is a
  couple more screens following the same pattern as `admin/page.tsx`.
- **Departments / locations / support groups / categories / SLA policy CRUD
  screens** — these are seeded and fully functional in the schema and API
  layer, but admin only edits them via the DB or Supabase Studio for now
  (the `/admin/settings` page shows where to extend this).
- **Automatic assignment rules UI** (section 26) — the `automation_rules`
  table exists; wiring it into ticket creation is a small addition to
  `app/api/tickets/route.ts`.
- **Asset ↔ ticket detail view / asset history** — assets can be created and
  listed; linking a ticket to an asset is already in the create-ticket API
  schema, but the "related tickets" view on an asset page isn't built yet.

None of the above are placeholder screens that pretend to work — they simply
don't exist yet, so you don't get a false sense of completeness.

## 1. Set up Supabase

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`.
3. In Storage, create a bucket named `ticket-attachments` (private).
4. Copy your Project URL, `anon` key, and `service_role` key.

## 2. Create the Telegram bot

1. Talk to [@BotFather](https://t.me/BotFather), `/newbot`, get your token.
2. `/setmenubutton` or just rely on `/start` — this app calls
   `setMyCommands` for you (see step 4).
3. `/newapp` (or Bot Settings → Mini App) to register your Mini App URL —
   or simply launch it via the inline "web_app" buttons this bot already
   sends (no separate Mini App registration is strictly required for that).

## 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=<any random string you generate>
NEXT_PUBLIC_APP_URL=https://your-deployment.vercel.app
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=<any random string you generate>
```

## 4. Deploy, then wire the webhook

```bash
npm install
npm run build   # or just deploy to Vercel, which builds for you
```

After your first deploy (so `NEXT_PUBLIC_APP_URL` is live), run:

```bash
npm run set-webhook
```

This registers the Telegram webhook at `/api/telegram/webhook` (with your
secret token) and sets the bot's command list.

## 5. Make yourself an admin

New users default to `EMPLOYEE`. After you `/start` the bot once (which
creates your user row), open Supabase Studio → `users` table and set your
row's `role` to `ADMIN`. From then on, promote others from `/admin/users`.

## 6. Point the IT group

In Telegram, add your bot to your IT support group, send it any message,
then check `https://api.telegram.org/bot<TOKEN>/getUpdates` to find the
group's `chat.id` (it will be negative, e.g. `-1001234567890`). Paste that
into `/admin/settings` → "IT Support Telegram group chat ID".

## 7. Test the full flow (spec section 52)

1. Employee: `/start` → Open IT Helpdesk → Create ticket → ticket number
   generated → IT group notified.
2. Technician: gets the group message → Take Ticket → employee notified →
   reply → employee replies → Resolve with a note.
3. Employee: gets "Resolved" message → Confirm Resolved → ticket closes.
4. Admin: `/admin` shows the full ticket, its history, SLA, and team load.

## Project structure

```
app/                     Next.js App Router — pages + API routes
  (app)/                 Mini App screens (employee/tech/admin), bottom-nav'd
  api/                   Backend: tickets, auth, admin, telegram webhook, cron
components/              Shared UI (ticket cards, status pills, nav, states)
lib/
  telegram/              initData validation, bot API client, useTelegram hook
  auth/                  requireUser() — the only place identity enters the app
  permissions.ts         Role checks used by every mutating route
  tickets/                Ticket numbering, audit logging
  sla/                    SLA policy + state calculation
  notifications/          Bot message templates per event
  supabase/               Server (service-role) and browser (anon) clients
supabase/schema.sql       Full DB schema, seed data, RLS backstop
scripts/set-webhook.ts    One-off script to register the Telegram webhook
```
