import webpush from "web-push";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appConfig } from "@/lib/app-config";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin || !process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_SUBJECT) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { title?: string; message?: string };
  const { data: subscriptions } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", user.id);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const results = await Promise.all((subscriptions ?? []).map(async (subscription) => {
    try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: body.title ?? appConfig.notificationTitle, body: body.message ?? appConfig.notificationMessage })); return true; }
    catch (error: unknown) { if (typeof error === "object" && error && "statusCode" in error && error.statusCode === 404) await admin.from("push_subscriptions").delete().eq("id", subscription.id); return false; }
  }));
  return NextResponse.json({ sent: results.filter(Boolean).length });
}