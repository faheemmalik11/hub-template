import { useEffect, useState, type ReactNode } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Skeleton } from "../../ui/skeleton";
import { Switch } from "../../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { AlertList } from "../../components/notifications/alerts";
import { useNotificationAcks } from "../../components/notifications/use-notification-acks";
import {
  ReminderDialog,
  englishReminderDialogLabels,
  type ReminderDialogLabels,
} from "../../components/notifications/reminder-dialog";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { NotificationsAdapter } from "../../adapters/notifications";
import { englishNotificationsPageLabels, type NotificationsPageLabels } from "./labels";

const DATE_RANGES = ["all", "today", "sevenDays", "thirtyDays"] as const;
type DateRange = (typeof DATE_RANGES)[number];

const RANGE_DAYS: Record<Exclude<DateRange, "all">, number> = {
  today: 0,
  sevenDays: 7,
  thirtyDays: 30,
};

function isWithinRange(isoDateTime: string, range: Exclude<DateRange, "all">): boolean {
  const itemTime = new Date(isoDateTime);
  if (Number.isNaN(itemTime.getTime())) return false;
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - RANGE_DAYS[range]);
  return itemTime.getTime() >= rangeStart.getTime();
}

export interface NotificationsPageProps {
  adapter: NotificationsAdapter;
  /** Whether the reader may see the settings tab. Without it only the alerts tab renders. */
  canOpenSettings?: boolean;
  /** Project-specific settings cards (channels, digest, Slack) rendered after the bell card. */
  extraSettingsCards?: ReactNode;
  labels?: NotificationsPageLabels;
  reminderLabels?: ReminderDialogLabels;
}

export function NotificationsPage({
  adapter,
  canOpenSettings = false,
  extraSettingsCards,
  labels = englishNotificationsPageLabels,
  reminderLabels = englishReminderDialogLabels,
}: NotificationsPageProps) {
  const [activeTab, setActiveTab] = useState("alerts");
  const showTabs = canOpenSettings;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{labels.title}</h1>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <Tabs value={showTabs ? activeTab : "alerts"} onValueChange={setActiveTab}>
        {showTabs && (
          <TabsList>
            <TabsTrigger value="alerts">{labels.alertsTab}</TabsTrigger>
            <TabsTrigger value="settings">{labels.settingsTab}</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="alerts" className="mt-4">
          <AlertsTab adapter={adapter} labels={labels} reminderLabels={reminderLabels} />
        </TabsContent>
        {showTabs && (
          <TabsContent value="settings" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <BellSettingsCard adapter={adapter} labels={labels} />
              {extraSettingsCards}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AlertsTab({
  adapter,
  labels,
  reminderLabels,
}: {
  adapter: NotificationsAdapter;
  labels: NotificationsPageLabels;
  reminderLabels: ReminderDialogLabels;
}) {
  const { items, loading } = adapter.useItems();
  const ackStore = adapter.useAckStore();
  const { isAcknowledged } = useNotificationAcks(items, ackStore);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [range, setRange] = useState<DateRange>("all");
  const recipients = adapter.useReminderRecipients();

  const rangeLabel: Record<DateRange, string> = {
    all: labels.anyTime,
    today: labels.today,
    sevenDays: labels.lastSevenDays,
    thirtyDays: labels.lastThirtyDays,
  };

  const filteredItems =
    range === "all" ? items : items.filter((item) => !item.at || isWithinRange(item.at, range));

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <Select value={range} onValueChange={(value) => setRange(value as DateRange)}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((value) => (
              <SelectItem key={value} value={value}>
                {rangeLabel[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {recipients.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setReminderOpen(true)}>
            <BellRing className="size-3.5" aria-hidden />
            {labels.remindButton}
          </Button>
        )}
      </div>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        <AlertList
          items={filteredItems}
          emptyText={labels.empty}
          isRead={isAcknowledged}
          readLabel={labels.readSectionTitle}
        />
      )}
      <ReminderDialog
        recipients={recipients}
        sendReminder={adapter.sendReminder}
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        labels={reminderLabels}
      />
    </div>
  );
}

function BellSettingsCard({
  adapter,
  labels,
}: {
  adapter: NotificationsAdapter;
  labels: NotificationsPageLabels;
}) {
  const { saved, isLoading, save } = adapter.useBellToggles();
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (saved && draft === null) setDraft(saved);
  }, [saved, draft]);

  const toggles = draft ?? saved ?? {};
  const isDirty = !!saved && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);

  async function saveDraft() {
    if (!draft) return;
    setIsSaving(true);
    try {
      await save(draft);
      toast.success(labels.saved);
    } catch (error) {
      toast.error(labels.saveFailed, { description: readableErrorMessage(error, "") });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !saved) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4 text-brand-dark" aria-hidden />
          {labels.bellCardTitle}
        </CardTitle>
        <CardDescription>{labels.bellCardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="divide-y divide-border">
          {adapter.bellEventGroups.map((group) => (
            <div key={group.key} className="py-2 first:pt-0">
              <p className="pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {labels.groupLabel(group.key)}
              </p>
              {group.events.map((eventKey) => (
                <label
                  key={eventKey}
                  className="flex cursor-pointer items-center justify-between gap-3 py-1.5"
                >
                  <span className="text-sm text-foreground">{labels.eventLabel(eventKey)}</span>
                  <Switch
                    checked={toggles[eventKey] !== false}
                    onCheckedChange={(checked) => setDraft({ ...toggles, [eventKey]: checked })}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-auto flex justify-end gap-2 pt-4">
          <Button
            size="sm"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={() => saved && setDraft(saved)}
          >
            {labels.cancel}
          </Button>
          <Button size="sm" disabled={!isDirty || isSaving} onClick={saveDraft}>
            {isSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {labels.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
