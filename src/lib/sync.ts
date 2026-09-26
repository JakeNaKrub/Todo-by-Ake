import { db, type Task } from "./db";

type RemoteTask = { id: string; title: string; notes: string | null; category: Task["category"]; urgency: Task["urgency"]; is_completed: boolean; created_at: string; deadline: string | null; updated_at: string };

export async function flushSyncQueue() {
  if (!navigator.onLine) return;
  const operations = await db.syncQueue.orderBy("id").toArray();
  if (!operations.length) return;
  try {
    const response = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations }) });
    if (!response.ok) return;
    const result = await response.json() as { tasks?: RemoteTask[]; tombstones?: { id: string }[] };
    await db.transaction("rw", db.tasks, async () => {
      for (const remote of result.tasks ?? []) {
        await db.tasks.put({ id: remote.id, title: remote.title, notes: remote.notes ?? undefined, category: remote.category, urgency: remote.urgency, isCompleted: remote.is_completed, createdAt: remote.created_at, deadline: remote.deadline ?? undefined, updatedAt: remote.updated_at });
      }
      await db.tasks.bulkDelete((result.tombstones ?? []).map((tombstone) => tombstone.id));
    });
    await db.syncQueue.bulkDelete(operations.map((operation) => operation.id).filter((id): id is number => typeof id === "number"));
  } catch {
    // Keep the durable queue for the next online event.
  }
}