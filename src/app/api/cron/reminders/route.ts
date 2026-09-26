import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { appConfig } from "@/lib/app-config";
import webpush from "web-push";

export async function GET() {
  const admin = createSupabaseAdminClient();
  if (!admin || !process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_SUBJECT) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const { data: jobs, error: jobsError } = await admin
    .from("reminder_jobs")
    .select("id,user_id,task_id,next_run_at,last_delivered_at")
    .lt("next_run_at", new Date(Date.now() + 5 * 60 * 1000).toISOString());

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const dueJobs = jobs ?? [];
  const results: { taskId: string; sent: boolean; userId: string }[] = [];

  for (const job of dueJobs) {
    const { data: task } = await admin
      .from("tasks")
      .select("id,title,deadline,is_completed")
      .eq("id", job.task_id)
      .maybeSingle();

    if (!task || task.is_completed) {
      await admin.from("reminder_jobs").delete().eq("id", job.id);
      continue;
    }

    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", job.user_id);

    const sends = await Promise.all((subscriptions ?? []).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({
            title: task.title || appConfig.notificationTitle,
            body: task.deadline ? `Deadline: ${new Date(task.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : appConfig.notificationMessage,
            actions: [
              { action: "open", title: "Open task" },
              { action: "complete", title: "Complete" },
              { action: "snooze", title: "Snooze 1h" },
            ],
          }),
        );
        return true;
      } catch (error: unknown) {
        if (typeof error === "object" && error && "statusCode" in error && error.statusCode === 404) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        }
        return false;
      }
    }));

    const delivered = sends.some(Boolean);
    await admin.from("reminder_jobs").update({
      last_delivered_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    results.push({ taskId: task.id, sent: delivered, userId: job.user_id });
  }

  return NextResponse.json({ ok: true, processed: dueJobs.length, results });
}

export async function POST() {
  return GET();
}
