import { db, type AppSettings, type ReminderJob, type Task } from "@/lib/db";

const DEFAULT_REMINDER_LEAD_MS = 30 * 60 * 1000;
const REMINDER_ALERT_WINDOW_MS = 15 * 60 * 1000;

export function getReminderIntervalMinutes(settings: AppSettings) {
  const minutes = settings.reminderFrequency === "thirtyMinutes"
    ? 30
    : settings.reminderFrequency === "custom"
      ? settings.customReminderMinutes
      : 60;
  return minutes * 60 * 1000;
}

export function getNextReminderAt(task: Task, settings: AppSettings, now = new Date()) {
  if (task.isCompleted) return null;

  const candidates: number[] = [];
  const updatedAtMs = new Date(task.updatedAt).getTime();
  const intervalMs = getReminderIntervalMinutes(settings);
  if (!Number.isNaN(updatedAtMs)) candidates.push(updatedAtMs + intervalMs);

  if (task.deadline) {
    const deadlineMs = new Date(task.deadline).getTime();
    if (!Number.isNaN(deadlineMs)) {
      candidates.push(deadlineMs);
    }
  }

  const futureCandidates = candidates.filter((value) => value > now.getTime());
  if (futureCandidates.length > 0) {
    return new Date(Math.min(...futureCandidates));
  }

  if (task.deadline) {
    const deadlineMs = new Date(task.deadline).getTime();
    if (!Number.isNaN(deadlineMs)) return new Date(deadlineMs);
  }

  return null;
}

export function shouldSendReminder(task: Task, settings: AppSettings, now = new Date()) {
  if (!settings.globalRemindersEnabled || task.isCompleted) return false;

  if (task.deadline) {
    const deadlineMs = new Date(task.deadline).getTime();
    if (!Number.isNaN(deadlineMs) && deadlineMs <= now.getTime()) return true;
    if (!Number.isNaN(deadlineMs) && deadlineMs - now.getTime() <= REMINDER_ALERT_WINDOW_MS) return true;
  }

  const nextAt = getNextReminderAt(task, settings, now);
  if (!nextAt) return false;
  const remainingMs = nextAt.getTime() - now.getTime();
  return remainingMs <= REMINDER_ALERT_WINDOW_MS;
}

export async function ensureReminderJob(task: Task, settings: AppSettings) {
  if (!settings.globalRemindersEnabled || task.isCompleted) {
    await db.reminderJobs.delete(task.id).catch(() => undefined);
    return null;
  }

  const nextRunAt = getNextReminderAt(task, settings);
  if (!nextRunAt) {
    await db.reminderJobs.delete(task.id).catch(() => undefined);
    return null;
  }

  const existing = await db.reminderJobs.get(task.id);
  const nextJob: ReminderJob = {
    taskId: task.id,
    nextRunAt: nextRunAt.toISOString(),
    lastDeliveredAt: existing?.lastDeliveredAt,
    updatedAt: new Date().toISOString(),
  };

  await db.reminderJobs.put(nextJob);
  return nextJob;
}

export async function markReminderDelivered(taskId: string, settings: AppSettings) {
  const existing = await db.reminderJobs.get(taskId);
  if (!existing) return;
  await db.reminderJobs.put({
    ...existing,
    lastDeliveredAt: new Date().toISOString(),
    nextRunAt: new Date(Date.now() + getReminderIntervalMinutes(settings)).toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
