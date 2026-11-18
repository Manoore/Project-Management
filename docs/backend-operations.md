# Backend notifications and scheduled work

## Available now

Task and project assignments create in-app notifications in the same database transaction as the assignment. This includes bulk task changes. Assigning the same owner again does not send another assignment notice. Reassignment suppresses stale unread notices.

The inbox uses the signed-in account and current project access. Revoking access hides related notifications. Completed tasks and changed deadlines hide stale reminders. No inbox query uses a fixed demo identity.

Notification preferences support in-app delivery, due reminders, an IANA time zone, and quiet hours. Quiet hours delay availability until the local end time, including daylight-saving changes. Partial preference updates preserve other settings. Email and daily-digest delivery are not configured; these channels are reported unavailable and cannot be enabled through the API.

## Daily worker setup

Set CRON_SECRET to a random value of at least 32 characters in each Vercel project's Production environment, then redeploy. Do not commit it. The route rejects requests when the secret is absent or invalid.

vercel.json invokes GET /api/jobs/daily daily at 08:00 UTC. Vercel supplies the configured secret as a Bearer token. The schedule fits the Hobby plan's daily frequency; Hobby invocation timing is not exact. See [Vercel cron security](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs) and [scheduling limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

Both connected Vercel projects may invoke the same database. An advisory lock prevents overlapping runs, and occurrence/reminder unique keys prevent duplicates across sequential runs.

The worker generates daily, weekly, and monthly tasks, then creates upcoming/today/overdue reminders. It checks recipient preferences, current project access, task completion, and due dates. Reminders deduplicate by task, owner, deadline, and recipient-local date.

Each run examines up to 100 schedules, generates up to 200 tasks, and catches up at most 31 occurrences per schedule. hasMore signals remaining due work. The administrator endpoint can safely rerun the worker. A schedule pauses when its creator, assignee, project, or module access becomes unavailable. Previously generated work is retained.

The job commits its task, notification, activity, and schedule-cursor updates together. A database error rolls back that run and writes a separate failure record with a redacted error code.

## Recurring schedule API

GET /api/recurrences?projectId=ID returns visible active schedules, revisions, next dates, generated-occurrence counts (nextIndex), pause errors, and canEdit.

POST /api/recurrences accepts projectId, title, cadence (daily/weekly/monthly), and startDate (YYYY-MM-DD). Optional fields are description, owner, priority, labels, moduleId, everyN, endDate, and enabled. New schedules can backfill at most 31 days. Occurrence dates are task due dates; the worker uses the UTC calendar.

PATCH accepts projectId, id, version, and changed editable fields. Pause/resume with enabled. After generation starts, changing startDate/cadence/everyN requires a new schedule; this protects existing occurrence history. Monthly dates remain anchored to the original day, so January 31 produces February's last day and March 31.

DELETE accepts projectId, id, and version in JSON. It archives the schedule without deleting generated tasks. Creators, project owners, and visible-project managers/admins can edit; viewers cannot write. These APIs are backend-ready; recurring-schedule management controls have not been added to the frontend in this batch.

## Inbox and preferences API

- GET /api/notifications supports limit (1–100), before (notification ID), unread=true, and summary=true.
- PATCH /api/notifications accepts either id or all=true, with optional read boolean. Only delivered, currently visible notifications can be changed.
- GET/PATCH /api/notification-preferences use inApp, email, dailyDigest, dueReminders, timeZone, and quietHours. quietHours is {enabled,start,end}; times use HH:MM. Delivery capabilities accompany responses.
- GET /api/admin/scheduler returns configuration readiness and recent run results. POST runs recovery work. Both require an administrator session; POST also requires a matching Origin.

## Microsoft SSO readiness

GET /api/auth/providers reports whether Microsoft configuration is present and syntactically valid without returning credentials. Supply the client ID, secret, dedicated tenant ID, and registered same-origin callback URI shown in .env.example.

Authorization uses PKCE and state. Callback/session branches are covered with a mocked Microsoft provider. Live Entra sign-in still requires the real configuration and tenant-side registration; it has not been claimed verified.

## Verification

node scripts/operations-regression.cjs runs input, cron-auth, provider-configuration, PKCE, state, and mocked callback checks.

scripts/operations-postgres-integration.cjs uses the same disposable localhost PostgreSQL setup as the planning integration suite. It covers private inboxes, assignment dedupe, read ownership, quiet hours/DST, partial preferences, deadline staleness, concurrent runs, recurrence revisions and dates, rollback, revoked access, retained tasks, and scheduler authorization. It never contacts Microsoft or an email provider.
