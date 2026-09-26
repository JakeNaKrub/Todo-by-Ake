import test from "node:test";
import assert from "node:assert/strict";

import type { AppSettings } from "../src/lib/db";
import { getReminderIntervalMinutes, getNextReminderAt, shouldSendReminder } from "../src/lib/reminders";

test("reminders use the configured interval", () => {
  const settings: AppSettings = {
    id: "settings",
    fontSize: 17,
    boldText: false,
    theme: "auto",
    soundEnabled: true,
    sortOption: "priority",
    confirmBeforeDelete: true,
    globalRemindersEnabled: true,
    reminderFrequency: "custom",
    customReminderMinutes: 15,
  };

  assert.equal(getReminderIntervalMinutes(settings), 15 * 60 * 1000);
});

test("reminders fire at the earliest of the next interval and the approaching deadline", () => {
  const now = new Date("2026-01-01T10:00:00Z");
  const task = {
    id: "task-1",
    title: "Draft report",
    category: "work" as const,
    urgency: "high" as const,
    isCompleted: false,
    createdAt: "2025-12-31T09:00:00Z",
    deadline: "2026-01-01T10:15:00Z",
    updatedAt: "2026-01-01T09:00:00Z",
  };

  const settings: AppSettings = {
    id: "settings",
    fontSize: 17,
    boldText: false,
    theme: "auto",
    soundEnabled: true,
    sortOption: "priority",
    confirmBeforeDelete: true,
    globalRemindersEnabled: true,
    reminderFrequency: "oneHour",
    customReminderMinutes: 90,
  };

  const nextRunAt = getNextReminderAt(task, settings, now);
  assert.ok(nextRunAt);
  assert.equal(nextRunAt.toISOString(), "2026-01-01T10:15:00.000Z");
  assert.equal(shouldSendReminder(task, settings, now), true);
});
