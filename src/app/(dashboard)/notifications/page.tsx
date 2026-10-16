"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Notification } from "@/types";
import { Bell, CheckCheck, Loader2, UserPlus } from "lucide-react";
import { formatDistanceToNow, isToday } from "date-fns";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

// Icon per notification type. Only one type exists today
// (conversation_assigned) but this keeps future types a one-line add.
const TYPE_ICON: Record<Notification["type"], typeof Bell> = {
  conversation_assigned: UserPlus,
};

export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const { accountId, accountStatus } = useAuth();
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) {
      if (accountStatus !== "loading") setNotifications([]);
      return;
    }
    const supabase = createClient();
    const { data, error: fetchErr } = await supabase
      .from("notifications")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (fetchErr) {
      setError(fetchErr.message);
      return;
    }
    setNotifications((data ?? []) as Notification[]);
  }, [accountId, accountStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Realtime — new assignments appear without a refresh, and a
  // "mark all read" fired from another tab/device stays in sync here.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              if (!prev) return [row];
              if (prev.some((n) => n.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Notification;
            setNotifications((prev) =>
              prev?.map((n) => (n.id === row.id ? { ...n, ...row } : n)) ??
              prev,
            );
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Notification>;
            setNotifications(
              (prev) => prev?.filter((n) => n.id !== oldRow.id) ?? prev,
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic — the row is already visually "read" by the time the
      // request lands, so the UI doesn't wait on the round-trip.
      setNotifications(
        (prev) =>
          prev?.map((n) =>
            n.id === id && !n.read_at
              ? { ...n, read_at: new Date().toISOString() }
              : n,
          ) ?? prev,
      );
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
      if (updateErr) {
        toast.error(t("markReadFailed"));
        load();
      }
    },
    [load, t],
  );

  const handleClick = useCallback(
    (n: Notification) => {
      if (!n.read_at) markRead(n.id);
      if (n.conversation_id) {
        router.push(`/inbox?c=${n.conversation_id}`);
      }
    },
    [markRead, router],
  );

  const unreadIds = notifications?.filter((n) => !n.read_at).map((n) => n.id) ?? [];

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications(
      (prev) => prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev,
    );
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null);
    setMarkingAll(false);
    if (updateErr) {
      toast.error(t("markAllFailed"));
      load();
    }
  }, [unreadIds.length, load, t]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (notifications === null) {
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-14 w-72 rounded-2xl" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </div>
    );
  }

  const today = notifications.filter((n) => isToday(new Date(n.created_at)));
  const earlier = notifications.filter((n) => !isToday(new Date(n.created_at)));

  const renderItem = (n: Notification) => {
    const Icon = TYPE_ICON[n.type] ?? Bell;
    const isUnread = !n.read_at;
    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => handleClick(n)}
          className={cn(
            " group relative flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
            isUnread
              ? "border-border-strong bg-muted hover:bg-card-2"
              : "border-border bg-card hover:bg-muted/40",
          )}
        >
          {isUnread ? (
            <span aria-hidden className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-tile" />
          ) : null}
          <span
            className={cn("icon-tile size-10 rounded-xl", !isUnread && "grayscale opacity-70")}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "truncate text-sm",
                  isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                )}
              >
                {n.title}
              </span>
              {isUnread && (
                <span aria-label={t("unread")} className="size-2 shrink-0 rounded-full bg-tile" />
              )}
            </span>
            {n.body && (
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{n.body}</span>
            )}
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        tile=""
        icon={Bell}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            disabled={unreadIds.length === 0 || markingAll}
            onClick={markAllRead}
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            {t("markAllRead")}
          </Button>
        }
      />

      {notifications.length === 0 || unreadIds.length === 0 ? (
        <div className="surface ">
          <EmptyState
            illustration="celebrate"
            title={t("caughtUpTitle")}
            description={notifications.length === 0 ? t("emptyDesc") : t("caughtUpDesc")}
          />
        </div>
      ) : null}

      {[
        { key: "today", items: today },
        { key: "earlier", items: earlier },
      ].map((group) =>
        group.items.length ? (
          <section key={group.key} aria-labelledby={`notif-${group.key}`}>
            <h2
              id={`notif-${group.key}`}
              className="mb-2 text-[11px] font-semibold text-muted-foreground "
            >
              {t(group.key)}
            </h2>
            <ul className="space-y-2">{group.items.map(renderItem)}</ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
