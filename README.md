# To-Do by Ake

Offline-first task manager for quick planning, deadline tracking, and local-first sync.

## What this app does

- Create, edit, complete, and delete tasks
- Organize tasks by category and urgency
- Track deadlines and reminder timing
- Work offline with IndexedDB storage
- Optionally sync with Supabase when signed in
- Enable browser push notifications for supported browsers

## Current status

This version is intentionally local-first. The app works without a backend, and Supabase is used for optional sign-in, sync, and push subscription storage.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

If you want full Supabase sync and push support, fill in the env values and run the SQL migration in `../supabase/schema.sql`.

## Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=https://yourdomain.com
```

Important:
- `NEXT_PUBLIC_*` values are safe to expose to the browser
- `SUPABASE_SERVICE_ROLE_KEY` and `VAPID_PRIVATE_KEY` must stay server-side only

Generate VAPID keys when needed:

```bash
npx web-push generate-vapid-keys
```

## App behavior

- Local-only mode: usable with IndexedDB alone
- Authenticated sync: uses Supabase for task and settings sync
- Push notifications: request permission and subscribe through the browser
- Reminder timing: browser-local scheduling for unfinished tasks and upcoming deadlines

## Routes

- `POST /api/sync` applies queued task changes and returns the current task set
- `POST /api/push/subscribe` stores a subscription
- `DELETE /api/push/subscribe` removes a subscription
- `POST /api/push/send` sends a test notification
- `GET|POST /api/cron/reminders` is the future server-side reminder scheduler for closed-app delivery

## Notes

- Supabase RLS restricts profiles, tasks, settings, tombstones, reminder jobs, and push subscriptions to the current user
- Task conflicts use newest `updated_at`
- Offline deletes are protected with tombstones
- This app is designed as a PWA and supports Add to Home Screen in supported browsers
