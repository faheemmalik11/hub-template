import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { pageTitle } from "@/lib/brand";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarClock,
  CheckCheck,
  Check,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  Loader2,
  Slack,
} from "lucide-react";
import { toast } from "sonner";

import { PingDialog, usePingRecipients } from "@/components/belege/ping-button";
import {
  CategoryFilterPills,
  NotificationRow,
  NotificationSection,
  type NotificationTone,
} from "@hub-kit/core/notifications";
import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import { overviewPeriodRange } from "@/components/dashboard/periods";
import type { NotificationItem } from "@/components/notifications/types";
import { isSetupAlert, useSetupAlerts } from "@/lib/data/use-setup-alerts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { fehlerText, formatDateTime } from "@/lib/data/format";
import {
  useNotificationChannels,
  useNotificationSettings,
  useSaveNotificationChannel,
  useLastDispatchRun,
  useSaveNotificationSettings,
  useSaveChannelSecret,
  useSendTestNotification,
  useSetUserSlackId,
  useSlackDirectory,
  useChannelSecretPresent,
  type NotificationSettings,
} from "@/lib/data/queries";
import { useNotificationAcks } from "@/lib/data/use-notification-acks";
import { useNotificationItems } from "@/lib/data/use-notification-items";
import { useLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type BenachrichtigungenTab = "meldungen" | "einstellungen";

const TAB_CLS =
  "rounded-none border-b-2 border-transparent px-1 pb-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-brand-hover data-[state=active]:bg-transparent data-[state=active]:text-brand-dark data-[state=active]:shadow-none";

const CARD_ICON = "grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint";

export const Route = createFileRoute("/benachrichtigungen/")({
  head: () => ({ meta: [{ title: pageTitle("Benachrichtigungen") }] }),
  validateSearch: (search: Record<string, unknown>): { tab: BenachrichtigungenTab } => ({
    tab: search.tab === "einstellungen" ? "einstellungen" : "meldungen",
  }),
  component: BenachrichtigungenShell,
});

// The alerts tab is for everyone: the dashboard's "see all" lands here. The settings tab keeps
// the admin gate the old full-page guard enforced; for everybody else it simply does not exist.
function BenachrichtigungenShell() {
  const { ready } = useAuth();
  if (!ready) return null;
  return <BenachrichtigungenPage />;
}

function BenachrichtigungenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const active: BenachrichtigungenTab = tab;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("einstellungen.titel")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("einstellungen.sub")}</p>
      </div>

      <Tabs
        value={active}
        onValueChange={(v) =>
          navigate({ to: "/benachrichtigungen", search: { tab: v as BenachrichtigungenTab } })
        }
      >
        <TabsList
          data-tour="notifications-tabs"
          className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0"
        >
          <TabsTrigger value="meldungen" className={TAB_CLS}>
            {t("notifications.tabMeldungen")}
          </TabsTrigger>
          <TabsTrigger value="einstellungen" className={TAB_CLS}>
            {t("notifications.tabEinstellungen")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="meldungen" className="mt-4" data-tour="notifications-alerts">
          <MeldungenTab />
        </TabsContent>
        <TabsContent value="einstellungen" className="mt-4">
          <EinstellungenTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MeldungenTab() {
  const { t } = useTranslation();
  const { items, loading } = useNotificationItems();
  const { isAcked, acknowledge, acknowledgeAll } = useNotificationAcks(items);
  const setup = useSetupAlerts();
  const [pingOffen, setPingOffen] = useState(false);
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useStoredPeriod("meldungen");
  const pingEmpfaenger = usePingRecipients();
  const range = overviewPeriodRange(period.period, new Date(), {
    von: period.von,
    bis: period.bis,
  });

  const filtered = items.filter((i) => {
    if (!i.at) return true;
    const day = i.at.slice(0, 10);
    if (range.von && day < range.von) return false;
    if (range.bis && day > range.bis) return false;
    return true;
  });

  const setupProblems = setup.items.filter((i) => i.key !== "setup:incomplete");
  const warnings = [...setupProblems, ...filtered.filter((i) => i.category === "alert")];
  const tasks = filtered.filter((i) => (i.category ?? "task") === "task");
  const hints = filtered.filter((i) => i.category === "info");
  const unreadCount = filtered.filter((i) => !i.passive && !isAcked(i)).length;

  const pills = [
    {
      key: "all",
      label: t("notifications.filter.all"),
      count: warnings.length + tasks.length + hints.length,
    },
    {
      key: "alerts",
      label: t("notifications.section.alerts"),
      count: warnings.length,
      tone: "danger" as NotificationTone,
    },
    {
      key: "tasks",
      label: t("notifications.section.tasks"),
      count: tasks.length,
      tone: "warn" as NotificationTone,
    },
    {
      key: "info",
      label: t("notifications.section.info"),
      count: hints.length,
      tone: "default" as NotificationTone,
    },
  ];
  const isRead = (item: NotificationItem) => (isSetupAlert(item) ? false : isAcked(item));
  const isUnread = (item: NotificationItem) => !item.passive && !isRead(item);
  const byUnreadFirst = (list: NotificationItem[]) =>
    [...list].sort((a, b) => Number(isUnread(b)) - Number(isUnread(a)));
  const sections = [
    { key: "alerts", tone: "danger" as NotificationTone, items: byUnreadFirst(warnings) },
    { key: "tasks", tone: "warn" as NotificationTone, items: byUnreadFirst(tasks) },
    { key: "info", tone: "default" as NotificationTone, items: byUnreadFirst(hints) },
  ].filter(
    (section) => section.items.length > 0 && (category === "all" || category === section.key),
  );

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CategoryFilterPills options={pills} value={category} onChange={setCategory} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
          {pingEmpfaenger.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="shadow-none"
              onClick={() => setPingOffen(true)}
            >
              <BellRing className="size-3.5" aria-hidden />
              {t("ping.titel")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="shadow-none"
            disabled={unreadCount === 0}
            onClick={() => acknowledgeAll(filtered.filter((i) => !i.passive))}
          >
            <CheckCheck className="size-3.5" aria-hidden />
            {t("notifications.markAllRead")}
          </Button>
        </div>
      </div>
      {sections.length === 0 && loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-brand-wash text-brand">
            <CheckCheck className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">{t("notifications.empty")}</p>
        </div>
      ) : (
        <div>
          {sections.map((section) => (
            <NotificationSection
              key={section.key}
              flat
              title={t(`notifications.section.${section.key}`)}
              tone={section.tone}
              initialVisible={category === "all" ? 3 : 50}
              seeAllLabel={(hidden) => t("notifications.seeAllCount", { count: hidden })}
              collapseLabel={t("notifications.collapse")}
            >
              {section.items.map((item) => (
                <NotificationRow
                  key={item.key}
                  tone={section.tone}
                  icon={item.icon}
                  title={item.message ?? item.label}
                  sourceLabel={item.source}
                  timestamp={item.atLabel ?? (item.at ? formatDateTime(item.at) : undefined)}
                  link={item.link}
                  onFollow={() => !isSetupAlert(item) && acknowledge(item)}
                  onMarkRead={
                    isUnread(item) && !isSetupAlert(item) ? () => acknowledge(item) : undefined
                  }
                  markReadLabel={t("notifications.markRead")}
                  unreadLabel={t("notifications.newBadge")}
                  unread={isUnread(item)}
                  read={isRead(item)}
                />
              ))}
            </NotificationSection>
          ))}
        </div>
      )}
      <PingDialog recipients={pingEmpfaenger} open={pingOffen} onOpenChange={setPingOffen} />
    </div>
  );
}

// The digest offers only the figures a morning summary can carry; "new since your last look"
// and pings are moments, not daily states, so they stay bell-only.
const DIGEST_EVENTS = ["faellig", "zuPruefen", "vorschlaege", "fehler", "personen"] as const;

const BELL_GROUPS = [
  { key: "zugewiesen", events: ["zuweisung", "rueckfrage", "abgelehnt", "ping"] },
  { key: "dokumente", events: ["neu", "zuPruefen", "faellig", "vorschlaege", "fehler"] },
] as const;

const SLACK_EVENTS = ["zuweisung", "rueckfrage", "abgelehnt", "ping"] as const;

function formatTime(hh: number, mm: number, locale: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (locale.startsWith("de")) return `${pad(hh)}:${pad(mm)}`;
  const suffix = hh < 12 ? "AM" : "PM";
  return `${pad(hh % 12 === 0 ? 12 : hh % 12)}:${pad(mm)} ${suffix}`;
}

function buildTimeOptions(locale: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push({
        value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        label: formatTime(h, m, locale),
      });
    }
  }
  return out;
}

const SLACK_MANIFEST = `display_information:
  name: Stäy Hub
  description: Benachrichtigungen aus dem Stäy Hub
features:
  bot_user:
    display_name: StaeyHub
    always_online: true
oauth_config:
  scopes:
    bot:
      - chat:write
      - chat:write.public
      - channels:read
      - groups:read
      - users:read
      - users:read.email
      - im:write
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false`;

const SLACK_CREATE_URL = `https://api.slack.com/apps?new_app=1&manifest_yaml=${encodeURIComponent(
  SLACK_MANIFEST,
)}`;

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="flex min-w-0 flex-col border-border bg-card shadow-none">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-1">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function EinstellungenTab() {
  const { t } = useTranslation();
  const { appUserId, can } = useAuth();
  const darfKanaele = can(PERMISSIONS.notificationsSettings);
  const settingsQ = useNotificationSettings(appUserId);
  const saveSettings = useSaveNotificationSettings(appUserId);
  const saveBell = useSaveNotificationSettings(appUserId);
  const channelsQ = useNotificationChannels();
  const saveChannel = useSaveNotificationChannel();
  const sendTest = useSendTestNotification();
  const lastRunQ = useLastDispatchRun();

  // Local form state, seeded from the loaded settings. Explicit save per card, so half-changed
  // toggles never write themselves.
  const [form, setForm] = useState<NotificationSettings | null>(null);
  useEffect(() => {
    if (settingsQ.data && !form) setForm(settingsQ.data);
  }, [settingsQ.data, form]);

  const slack = channelsQ.data?.find((c) => c.key === "slack");
  const slackConnected = useChannelSecretPresent("slack");
  const saveSlackToken = useSaveChannelSecret("slack");
  const [slackLinks, setSlackLinks] = useState<Record<string, string>>({});
  const [slackToken, setSlackToken] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  const [slackChannel, setSlackChannel] = useState<string | null>(null);
  const [slackDm, setSlackDm] = useState<boolean | null>(null);
  const [slackEnabled, setSlackEnabled] = useState<boolean | null>(null);
  const [slackEvents, setSlackEvents] = useState<Record<string, boolean> | null>(null);
  const directory = useSlackDirectory(slackConnected.data === true);
  const slackChannels = directory.data?.channels ?? [];
  const { locale } = useLocale();
  const timeChoices = useMemo(() => buildTimeOptions(locale), [locale]);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const people = useMemo(() => directory.data?.people ?? [], [directory.data]);
  const slackMembers = directory.data?.members ?? [];
  const linkSlackUser = useSetUserSlackId();
  const matchedCount = people.filter((p) => (p.slackUserId ?? p.autoMatch) != null).length;
  const [showPeople, setShowPeople] = useState(false);
  const hubUrl =
    typeof window === "undefined" || /^(localhost|127\.|\[::1\])/.test(window.location.hostname)
      ? ""
      : window.location.origin;
  const sortedPeople = useMemo(
    () =>
      [...people].sort(
        (a, b) =>
          Number((a.slackUserId ?? a.autoMatch) != null) -
          Number((b.slackUserId ?? b.autoMatch) != null),
      ),
    [people],
  );
  useEffect(() => {
    if (slack && slackChannel === null) {
      setSlackChannel(String(slack.config.team_channel ?? ""));
      setSlackDm(slack.config.dm !== false);
      setSlackEnabled(slack.enabled);
      setSlackEvents((slack.config.events as Record<string, boolean>) ?? {});
    }
  }, [slack, slackChannel]);

  // Dirty against the loaded baseline: a Save that would write what is already stored stays
  // disabled. After a successful save the settings query refetches, the baseline catches up and
  // the button falls back to disabled on its own.
  const basis = settingsQ.data;
  const glockeDirty =
    !!form && !!basis && JSON.stringify(form.bell_events) !== JSON.stringify(basis.bell_events);
  const digestDirty =
    !!form &&
    !!basis &&
    (form.digest_enabled !== basis.digest_enabled ||
      form.digest_time !== basis.digest_time ||
      JSON.stringify(form.digest_events) !== JSON.stringify(basis.digest_events));
  const slackDirty =
    !!slack &&
    (slackToken.trim() !== "" ||
      (slackChannel ?? "") !== String(slack.config.team_channel ?? "") ||
      (slackDm ?? true) !== (slack.config.dm !== false) ||
      JSON.stringify(slackEvents ?? {}) !== JSON.stringify(slack.config.events ?? {}) ||
      (slackEnabled ?? false) !== slack.enabled);
  // A staged person -> Slack link counts as a change like any other, so it saves with the button
  // rather than the moment the dropdown moves.
  const linkChanges = useMemo(
    () =>
      Object.entries(slackLinks).filter(([userId, slackId]) => {
        const person = people.find((p) => p.id === userId);
        return person ? slackId !== (person.slackUserId ?? person.autoMatch ?? "") : false;
      }),
    [slackLinks, people],
  );
  const linksDirty = linkChanges.length > 0;
  const slackReady = slackConnected.data === true && !!slack?.enabled;

  function disconnectSlack() {
    saveSlackToken.mutate(null, {
      onSuccess: () => {
        setSlackToken("");
        setEditingToken(false);
        setSlackEnabled(false);
        toast.success(t("einstellungen.kanaele.slackGetrennt"));
      },
      onError: (e) => toast.error(fehlerText(e)),
    });
  }

  function resetSlack() {
    if (slack) {
      setSlackChannel(String(slack.config.team_channel ?? ""));
      setSlackDm(slack.config.dm !== false);
      setSlackEnabled(slack.enabled);
      setSlackEvents((slack.config.events as Record<string, boolean>) ?? {});
    }
    setSlackToken("");
    setEditingToken(false);
    setSlackLinks({});
    if (basis && form) {
      setForm({
        ...form,
        digest_enabled: basis.digest_enabled,
        digest_time: basis.digest_time,
        digest_events: basis.digest_events,
      });
    }
  }

  function saveSlack() {
    const token = slackToken.trim();
    if (token && !/^(xoxb-|xoxe[.-])/.test(token)) {
      toast.error(t("einstellungen.kanaele.slackTokenUngueltig"));
      return;
    }
    const digest =
      digestDirty && form
        ? {
            digest_enabled: form.digest_enabled,
            digest_time: form.digest_time,
            digest_channel: "team" as const,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            digest_events: form.digest_events,
          }
        : null;
    const done = async () => {
      for (const [userId, slackId] of linkChanges) {
        await linkSlackUser.mutateAsync({ userId, slackId }).catch((e) => {
          toast.error(fehlerText(e));
        });
      }
      setSlackLinks({});
      setSlackToken("");
      setEditingToken(false);
      toast.success(t("einstellungen.gespeichert"));
    };
    const saveDigestSettings = () =>
      digest
        ? saveSettings.mutate(digest, {
            onSuccess: done,
            onError: (e) => toast.error(fehlerText(e)),
          })
        : done();
    const saveChannelRow = () =>
      slackDirty
        ? saveChannel.mutate(
            {
              key: "slack",
              enabled: (slackEnabled ?? false) && (slackConnected.data === true || token !== ""),
              config: {
                ...slack.config,
                team_channel: (slackChannel ?? "").trim(),
                dm: slackDm ?? true,
                events: slackEvents ?? {},
                ...(slackEnabled && !slack.enabled ? { enabled_at: new Date().toISOString() } : {}),
                ...(hubUrl ? { hub_url: hubUrl } : {}),
              },
            },
            { onSuccess: saveDigestSettings, onError: (e) => toast.error(fehlerText(e)) },
          )
        : saveDigestSettings();
    if (!token) return saveChannelRow();
    saveSlackToken.mutate(token, {
      onSuccess: saveChannelRow,
      onError: (e) => toast.error(fehlerText(e)),
    });
  }

  function speichern(changes: Partial<NotificationSettings>) {
    saveBell.mutate(changes, {
      onSuccess: () => toast.success(t("einstellungen.gespeichert")),
      onError: (e) => toast.error(fehlerText(e)),
    });
  }

  if (!form || channelsQ.isPending) {
    return (
      <div className={cn("grid items-start gap-4", darfKanaele && "lg:grid-cols-2")}>
        <CardSkeleton rows={9} />
        {darfKanaele && <CardSkeleton rows={6} />}
      </div>
    );
  }

  return (
    <div className={cn("grid items-start gap-4", darfKanaele && "lg:grid-cols-2")}>
      <Card
        data-tour="notifications-bell"
        className="flex min-w-0 flex-col border-border bg-card shadow-none"
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className={CARD_ICON}>
              <BellRing className="size-4 text-brand-dark" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle>{t("einstellungen.glocke.titel")}</CardTitle>
              <CardDescription>{t("einstellungen.glocke.desc")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <div>
            {BELL_GROUPS.map((group) => (
              <div key={group.key}>
                <p className="pt-5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t(`einstellungen.glocke.gruppe.${group.key}`)}
                </p>
                <div className="divide-y divide-border">
                  {group.events.map((typ) => (
                    <label
                      key={typ}
                      className="flex cursor-pointer items-center justify-between gap-3 py-3"
                    >
                      <span className="text-sm text-foreground">
                        {t(`einstellungen.event.${typ}`)}
                      </span>
                      <Switch
                        checked={form.bell_events[typ] !== false}
                        onCheckedChange={(v) =>
                          setForm({ ...form, bell_events: { ...form.bell_events, [typ]: v } })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto flex justify-end gap-2 pt-4">
            {glockeDirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => basis && setForm({ ...form, bell_events: basis.bell_events })}
              >
                {t("einstellungen.kanaele.abbrechen")}
              </Button>
            )}
            <Button
              size="sm"
              disabled={!glockeDirty || saveBell.isPending}
              onClick={() => speichern({ bell_events: form.bell_events })}
            >
              {saveBell.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {t("einstellungen.speichern")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Offered channels are DATA: the card lists this project's notification_channels rows.
          A Hub whose client wants no external delivery has no rows and no card; the whole
          system keeps working in-app. */}
      {darfKanaele && (channelsQ.data?.length ?? 0) > 0 && (
        <Card
          data-tour="notifications-slack"
          className="flex min-w-0 flex-col border-border bg-card shadow-none"
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={CARD_ICON}>
                  <Slack className="size-4 text-brand-dark" aria-hidden />
                </span>
                <div className="min-w-0">
                  <CardTitle>{t("einstellungen.kanaele.slackTitel")}</CardTitle>
                  <CardDescription>{t("einstellungen.kanaele.slackDesc")}</CardDescription>
                </div>
              </div>
              <Switch
                aria-label={t("einstellungen.kanaele.slackAktiv")}
                checked={slackEnabled ?? false}
                disabled={!slackConnected.data}
                onCheckedChange={(v) => setSlackEnabled(v)}
              />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {slack && (
              <>
                {!slackConnected.data || editingToken ? (
                  <ol className="space-y-4">
                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand-dark">
                        1
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm text-foreground">
                          {t("einstellungen.kanaele.slackSchritt1")}
                        </p>
                        <Button size="sm" variant="outline" className="shadow-none" asChild>
                          <a href={SLACK_CREATE_URL} target="_blank" rel="noreferrer noopener">
                            <ExternalLink className="size-3.5" aria-hidden />
                            {t("einstellungen.kanaele.slackAppErstellen")}
                          </a>
                        </Button>
                        <ol className="ml-4 list-decimal space-y-0.5 text-xs text-muted-foreground">
                          <li>{t("einstellungen.kanaele.slackSchritt1a")}</li>
                          <li>{t("einstellungen.kanaele.slackSchritt1b")}</li>
                          <li>{t("einstellungen.kanaele.slackSchritt1c")}</li>
                        </ol>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand-dark">
                        2
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm text-foreground">
                          {t("einstellungen.kanaele.slackSchritt2")}
                        </p>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            autoComplete="off"
                            placeholder="xoxb-..."
                            value={slackToken}
                            onChange={(e) => setSlackToken(e.target.value)}
                          />
                          <Button
                            size="sm"
                            className="shrink-0"
                            disabled={!slackToken.trim() || saveSlackToken.isPending}
                            onClick={saveSlack}
                          >
                            {saveSlackToken.isPending && (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            )}
                            {t("einstellungen.kanaele.slackVerbinden")}
                          </Button>
                          {editingToken && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="shrink-0"
                              onClick={() => {
                                setSlackToken("");
                                setEditingToken(false);
                              }}
                            >
                              {t("einstellungen.kanaele.abbrechen")}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("einstellungen.kanaele.slackSchritt2Hinweis")}
                        </p>
                      </div>
                    </li>
                  </ol>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                          <CheckCircle2 className="size-4" aria-hidden />
                          {t("einstellungen.kanaele.slackVerbunden")}
                        </p>
                        {lastRunQ.data && (
                          <p
                            className={
                              lastRunQ.data.ok
                                ? "mt-0.5 text-xs text-muted-foreground"
                                : "mt-0.5 text-xs font-medium text-red-600"
                            }
                          >
                            {t(
                              lastRunQ.data.ok
                                ? "einstellungen.kanaele.letzterLaufOk"
                                : "einstellungen.kanaele.letzterLaufFehler",
                              {
                                time: formatDateTime(
                                  lastRunQ.data.finished_at ?? lastRunQ.data.started_at,
                                ),
                              },
                            )}
                          </p>
                        )}
                      </div>
                      {!editingToken && (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="shadow-none"
                            disabled={!slackReady || sendTest.isPending}
                            onClick={() =>
                              sendTest.mutate("slack", {
                                onSuccess: () => toast.success(t("einstellungen.kanaele.testOk")),
                                onError: (e) => toast.error(fehlerText(e)),
                              })
                            }
                          >
                            {sendTest.isPending && (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            )}
                            {t("einstellungen.kanaele.test")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingToken(true)}
                            className="text-muted-foreground"
                          >
                            {t("einstellungen.kanaele.slackTokenErsetzen")}
                          </Button>
                          <Separator orientation="vertical" className="h-5" />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                {t("einstellungen.kanaele.slackTrennen")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("einstellungen.kanaele.slackTrennenTitel")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("einstellungen.kanaele.slackTrennenText")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("einstellungen.kanaele.abbrechen")}
                                </AlertDialogCancel>
                                <AlertDialogAction onClick={disconnectSlack}>
                                  {t("einstellungen.kanaele.slackTrennen")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {slackConnected.data && (
                  <>
                    <div className="border-t border-border pt-4">
                      <p className="text-sm font-semibold text-foreground">
                        {t("einstellungen.kanaele.abschnittMeldungen")}
                      </p>
                      <div className="mt-2 divide-y divide-border">
                        {SLACK_EVENTS.map((typ) => (
                          <label
                            key={typ}
                            className="flex cursor-pointer items-center justify-between gap-3 py-2.5"
                          >
                            <span className="text-sm text-foreground">
                              {t(`einstellungen.kanaele.event.${typ}`)}
                            </span>
                            <Switch
                              checked={(slackEvents ?? {})[typ] !== false}
                              onCheckedChange={(v) =>
                                setSlackEvents({ ...(slackEvents ?? {}), [typ]: v })
                              }
                            />
                          </label>
                        ))}
                      </div>

                      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-4">
                        <span className="text-sm text-foreground">
                          {t("einstellungen.kanaele.slackDm")}
                        </span>
                        <Switch checked={slackDm ?? true} onCheckedChange={(v) => setSlackDm(v)} />
                      </label>

                      {(slackDm ?? true) && directory.isPending && (
                        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          {t("einstellungen.kanaele.slackLaedt")}
                        </p>
                      )}

                      {(slackDm ?? true) && people.length > 0 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setShowPeople((v) => !v)}
                            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                            {t("einstellungen.kanaele.slackPersonenTreffer", {
                              found: matchedCount,
                              total: people.length,
                            })}
                            <ChevronDown
                              className={cn(
                                "size-3.5 transition-transform",
                                showPeople && "rotate-180",
                              )}
                              aria-hidden
                            />
                          </button>
                          {showPeople && (
                            <div className="mt-2 overflow-hidden rounded-lg border border-border">
                              <ul className="divide-y divide-border">
                                {sortedPeople.map((person) => (
                                  <li
                                    key={person.id}
                                    className="flex items-center justify-between gap-3 px-3 py-2"
                                  >
                                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                      {person.name}
                                    </span>
                                    <div className="w-48 shrink-0">
                                      <Combobox
                                        value={
                                          slackLinks[person.id] ??
                                          person.slackUserId ??
                                          person.autoMatch ??
                                          ""
                                        }
                                        onValueChange={(v) =>
                                          setSlackLinks((prev) => ({ ...prev, [person.id]: v }))
                                        }
                                        options={[
                                          {
                                            value: "",
                                            label: t("einstellungen.kanaele.slackPersonKeine"),
                                          },
                                          ...slackMembers.map((m) => ({
                                            value: m.id,
                                            label: m.label,
                                          })),
                                        ]}
                                      />
                                    </div>
                                  </li>
                                ))}
                              </ul>
                              <p className="border-t border-border bg-brand-wash px-3 py-2 text-xs text-muted-foreground">
                                {t("einstellungen.kanaele.slackPersonHinweis")}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border pt-4">
                      <label className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <CalendarClock className="size-4 text-brand-dark" aria-hidden />
                          {t("einstellungen.digest.titel")}
                        </span>
                        <Switch
                          checked={form.digest_enabled}
                          onCheckedChange={(v) => setForm({ ...form, digest_enabled: v })}
                        />
                      </label>

                      {form.digest_enabled && (
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>{t("einstellungen.digest.uhrzeit")}</Label>
                              <Combobox
                                value={form.digest_time}
                                onValueChange={(v) => setForm({ ...form, digest_time: v })}
                                options={timeChoices}
                              />
                              <p className="text-xs text-muted-foreground">
                                {t("einstellungen.digest.zeitzone", { zone: localZone })}
                              </p>
                            </div>
                            <div className="space-y-1.5">
                              <Label>{t("einstellungen.kanaele.slackKanal")}</Label>
                              {directory.isPending ? (
                                <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground">
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                  {t("einstellungen.kanaele.slackLaedt")}
                                </div>
                              ) : slackChannels.length > 0 ? (
                                <Combobox
                                  value={(slackChannel ?? "").replace(/^#/, "")}
                                  onValueChange={(v) => setSlackChannel(v)}
                                  options={slackChannels.map((c) => ({
                                    value: c.name,
                                    label: `# ${c.name}`,
                                  }))}
                                />
                              ) : (
                                <Input
                                  placeholder="#general"
                                  value={slackChannel ?? ""}
                                  onChange={(e) => setSlackChannel(e.target.value)}
                                />
                              )}
                              {!directory.isPending &&
                                (directory.data?.channelError || directory.isError) && (
                                  <p className="text-xs text-muted-foreground">
                                    {t("einstellungen.kanaele.slackKanalScope")}
                                  </p>
                                )}
                            </div>
                          </div>
                          <div>
                            <Label>{t("einstellungen.digest.inhalt")}</Label>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {DIGEST_EVENTS.map((typ) => {
                                const on = form.digest_events[typ] !== false;
                                return (
                                  <button
                                    key={typ}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() =>
                                      setForm({
                                        ...form,
                                        digest_events: { ...form.digest_events, [typ]: !on },
                                      })
                                    }
                                    className={cn(
                                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                      on
                                        ? "border-brand-tint bg-brand-tint text-brand-dark"
                                        : "border-border bg-card text-muted-foreground hover:border-brand-soft",
                                    )}
                                  >
                                    <Check
                                      className={cn("size-3.5", on ? "opacity-100" : "opacity-0")}
                                      aria-hidden
                                    />
                                    {t(`einstellungen.event.${typ}`)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 border-t border-border pt-4">
                      {(slackDirty || digestDirty || linksDirty) && (
                        <Button size="sm" variant="ghost" onClick={resetSlack}>
                          {t("einstellungen.kanaele.abbrechen")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={
                          (!slackDirty && !digestDirty && !linksDirty) ||
                          linkSlackUser.isPending ||
                          saveChannel.isPending ||
                          saveSlackToken.isPending ||
                          saveSettings.isPending
                        }
                        onClick={saveSlack}
                      >
                        {(saveChannel.isPending ||
                          saveSlackToken.isPending ||
                          saveSettings.isPending) && (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        )}
                        {t("einstellungen.kanaele.aenderungenSpeichern")}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
