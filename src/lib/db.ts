import Dexie, { type Table } from "dexie";

export type Category = "work" | "school" | "personal";
export type Urgency = "high" | "medium" | "low";
export type ThemeOption = "auto" | "bright" | "dark";
export type ReminderFrequency = "thirtyMinutes" | "oneHour" | "custom";
export type SortOption = "priority" | "newest" | "oldest";
export type Task = { id: string; title: string; notes?: string; category: Category; urgency: Urgency; isCompleted: boolean; createdAt: string; deadline?: string; updatedAt: string };
export type AppSettings = { id: "settings"; fontSize: number; boldText: boolean; theme: ThemeOption; soundEnabled: boolean; sortOption: SortOption; confirmBeforeDelete: boolean; globalRemindersEnabled: boolean; reminderFrequency: ReminderFrequency; customReminderMinutes: number };
export type SyncOperation = { id?: number; entityId: string; action: "upsert" | "delete"; payload?: Task; createdAt: string };
export type ReminderJob = { taskId: string; nextRunAt: string; lastDeliveredAt?: string; updatedAt: string };

class TodoDatabase extends Dexie {
  tasks!: Table<Task, string>;
  settings!: Table<AppSettings, string>;
  syncQueue!: Table<SyncOperation, number>;
  reminderJobs!: Table<ReminderJob, string>;
  constructor() {
    super("todo-by-ake");
    this.version(1).stores({
      tasks: "id, createdAt, updatedAt, category, isCompleted",
      settings: "id",
      syncQueue: "++id, entityId, createdAt",
    });
    this.version(2).stores({
      tasks: "id, createdAt, updatedAt, category, isCompleted",
      settings: "id",
      syncQueue: "++id, entityId, createdAt",
      reminderJobs: "taskId, nextRunAt, lastDeliveredAt",
    });
  }
}

export const db = new TodoDatabase();
export const defaultSettings: AppSettings = { id: "settings", fontSize: 17, boldText: false, theme: "auto", soundEnabled: true, sortOption: "priority", confirmBeforeDelete: true, globalRemindersEnabled: false, reminderFrequency: "oneHour", customReminderMinutes: 90 };
export async function queueOperation(operation: SyncOperation) { await db.syncQueue.add(operation); }
export async function saveTask(task: Task) { await db.tasks.put(task); await queueOperation({ entityId: task.id, action: "upsert", payload: task, createdAt: new Date().toISOString() }); }
export async function removeTask(id: string) { await db.tasks.delete(id); await queueOperation({ entityId: id, action: "delete", createdAt: new Date().toISOString() }); }
export async function saveReminderJob(job: ReminderJob) { await db.reminderJobs.put(job); }
export async function getReminderJob(taskId: string) { return db.reminderJobs.get(taskId); }
export async function deleteReminderJob(taskId: string) { await db.reminderJobs.delete(taskId); }