import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Operation = { entityId: string; action: "upsert" | "delete"; payload?: Record<string, unknown>; createdAt: string };

function bad(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return bad("Supabase is not configured", 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad("Authentication required", 401);
  const body = await request.json().catch(() => null) as { operations?: Operation[] } | null;
  const operations = body?.operations ?? [];
  if (!Array.isArray(operations)) return bad("Invalid operations");

  for (const operation of operations) {
    if (!operation.entityId || !operation.createdAt || !["upsert", "delete"].includes(operation.action)) return bad("Invalid sync operation");
    const { data: current } = await supabase.from("tasks").select("updated_at").eq("id", operation.entityId).eq("user_id", user.id).maybeSingle();
    const { data: tombstone } = await supabase.from("task_tombstones").select("deleted_at").eq("id", operation.entityId).eq("user_id", user.id).maybeSingle();
    const incomingTime = new Date(operation.payload?.updatedAt as string || operation.createdAt).getTime();
    const currentTime = current ? new Date(current.updated_at).getTime() : -1;
    const deletedTime = tombstone ? new Date(tombstone.deleted_at).getTime() : -1;
    if (Math.max(currentTime, deletedTime) > incomingTime) continue;

    if (operation.action === "delete") {
      await supabase.from("tasks").delete().eq("id", operation.entityId).eq("user_id", user.id);
      await supabase.from("task_tombstones").upsert({ id: operation.entityId, user_id: user.id, deleted_at: operation.createdAt });
      continue;
    }

    const payload = operation.payload;
    if (!payload || typeof payload.title !== "string") return bad("Invalid task payload");
    await supabase.from("task_tombstones").delete().eq("id", operation.entityId).eq("user_id", user.id);
    const { error } = await supabase.from("tasks").upsert({
      id: operation.entityId,
      user_id: user.id,
      title: payload.title,
      notes: payload.notes ?? null,
      category: payload.category,
      urgency: payload.urgency,
      is_completed: payload.isCompleted,
      created_at: payload.createdAt,
      deadline: payload.deadline ?? null,
      updated_at: payload.updatedAt ?? operation.createdAt,
    });
    if (error) return bad(error.message, 500);
  }

  const [{ data: tasks, error: taskError }, { data: tombstones, error: tombstoneError }] = await Promise.all([
    supabase.from("tasks").select("id,title,notes,category,urgency,is_completed,created_at,deadline,updated_at").eq("user_id", user.id),
    supabase.from("task_tombstones").select("id,deleted_at").eq("user_id", user.id),
  ]);
  if (taskError || tombstoneError) return bad((taskError ?? tombstoneError)?.message ?? "Sync failed", 500);
  return NextResponse.json({ tasks: tasks ?? [], tombstones: tombstones ?? [] });
}