import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushStatus = "unsupported" | "denied" | "default" | "subscribed" | "ready";

export function usePushSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("default");
  const [busy, setBusy] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported"); return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }
    const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub && user) {
      const { data } = await supabase.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
      setSubscriptionId((data as any)?.id || null);
      setStatus("subscribed");
    } else {
      setStatus(Notification.permission === "granted" ? "ready" : "default");
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus(perm === "denied" ? "denied" : "default"); return; }
      const { data: cfg } = await supabase.from("app_config").select("value").eq("key", "vapid_public_key").maybeSingle();
      const publicKey = (cfg as any)?.value as string;
      if (!publicKey) throw new Error("Push not configured");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json: any = sub.toJSON();
      const { data, error } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "endpoint" }).select("id").single();
      if (error) throw error;
      setSubscriptionId((data as any).id);
      setStatus("subscribed");
    } finally { setBusy(false); }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscriptionId(null);
      setStatus("ready");
    } finally { setBusy(false); }
  }, []);

  const sendTest = useCallback(async () => {
    if (!subscriptionId) return;
    await supabase.functions.invoke("send-push", {
      body: { subscription_ids: [subscriptionId], payload: { title: "Khambu test", body: "Push notifications are working on this device.", url: "/notifications" } },
    });
  }, [subscriptionId]);

  return { status, busy, subscribe, unsubscribe, sendTest, refresh };
}
