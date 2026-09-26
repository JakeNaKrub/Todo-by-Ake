# Future Work

## Status

- Chosen delivery model: browser timers for local-only reminder delivery; server-side scheduling is deferred.
- Reminder scheduling for unfinished tasks and deadlines is implemented in the browser path.
- Reminder jobs persist next-run timestamps locally so reminders survive reloads.
- Duplicate reminders are reduced by a single next-run job per task, and last-delivery timestamps are tracked.

## Remaining

- Add reminder notification actions such as Complete, Snooze, and Open task.
- Test reminders across macOS browsers, installed PWA mode, and phone browsers.
- Confirm browser permission edge cases and subscription cleanup for the push path.
- Revisit a server scheduler later for reliable push delivery when the app is closed.

## Optional Ideas

- Per-task reminder date, time, and repeat rules.
- Snooze presets such as 10 minutes, one hour, and tomorrow.
- Quiet hours and weekday-only schedules.
- Notification grouping for multiple unfinished tasks.
- Reminder history and a dismiss-all action.
- Time-zone-aware scheduling for traveling users.
- Email reminders as a fallback when push permission is unavailable.
- Realtime sync for task changes across open devices.
- User-configurable notification title, message, sound, and icon.
