# To-Do by Ake

Offline-first Next.js PWA port of the Swift app.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

The app remains usable with only IndexedDB when Supabase is not configured. For cloud sync and push notifications, fill in `.env.local` and apply `../supabase/schema.sql` in the Supabase SQL editor.

Generate VAPID keys once, outside source control:

```bash
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key in `VAPID_PRIVATE_KEY`, and use a `mailto:` value for `VAPID_SUBJECT`. Never expose the private key to the browser.

## Auth and push

The API routes use the Supabase Auth session cookie. Configure an auth provider in Supabase, sign users in through the Supabase browser client, then open Settings and choose **Enable Push Notifications**. The browser asks for permission, stores the subscription under the authenticated user, and the service worker displays incoming VAPID notifications.

Routes:

- `POST /api/sync` applies queued task changes and returns the current task set.
- `POST /api/push/subscribe` stores a subscription.
- `DELETE /api/push/subscribe` removes a subscription.
- `POST /api/push/send` sends a test/user reminder notification.
- `GET|POST /api/cron/reminders` runs the server-side due reminder scheduler for installed push subscribers when the app is closed.

The server reminder cron expects the Supabase migration in `../supabase/schema.sql` to include the `public.reminder_jobs` table, and it should be scheduled every 5 minutes to process due reminders reliably.

Supabase RLS policies restrict profiles, tasks, settings, tombstones, and push subscriptions to the current authenticated user. Task conflicts use the newest `updated_at`; deletes use tombstones so an offline delete cannot be resurrected by an older write.
