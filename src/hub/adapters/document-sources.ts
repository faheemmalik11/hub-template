import { Upload } from "lucide-react";

import { DropboxIcon, MicrosoftIcon } from "@/kit/pages";

import type {
  DocumentSource,
  DocumentSourcesAdapter,
  FieldOption,
  SourceActor,
  SourceFieldValue,
  SourceRun,
  SourceRunRequest,
} from "@/kit/adapters";

import { formatDateTime } from "@/lib/data/format";
import {
  useActorDisplay,
  useAskForARun,
  useChannelFolders,
  useChannels,
  useFilingFolders,
  useMailboxFolders,
  usePipelineHealth,
  useRunNowEnabled,
  useRunRequests,
  useSaveChannelFolders,
  useUpdateChannel,
} from "@/lib/data/queries";
import type { FolderOption } from "@/lib/postfach/folder-option";
import {
  processedRoleFor,
  type ChannelFolderRole,
  type PipelineRun,
  type RunRequest,
} from "@/lib/data/types";
import { namesOf, viewOf, type SourceView } from "@/lib/data/channel-sources";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import { useMemo, useState } from "react";

/** What a source card reads from a folder listing. A plain object, so it can be memoised. */
type FolderListing = {
  data: FolderOption[] | undefined;
  isLoading: boolean;
  isError: boolean;
};

const NO_RUNS: PipelineRun[] = [];

type Translate = (key: string, options?: Record<string, unknown>) => string;

// What each card is called on our side, and what the pipeline calls the same thing. These names
// are the tenant's channel keys as its config spells them — not display names — and the run
// history, the run request and the lock are all keyed on them. One home, because the run list
// and the "run now" button both need it and two copies would drift.
const PIPELINE_CHANNEL = {
  mail: "mailbox",
  filing: "scan_folder",
  upload: "upload",
} as const;

type CardId = keyof typeof PIPELINE_CHANNEL;

/**
 * Let "Run now" read chosen folders (P3), offering the card's own source-folder picker, so a folder
 * that can be picked for one run is exactly one the settings sheet lists.
 */
function offeringFolders(card: DocumentSource, folderFieldKey: string): DocumentSource {
  return { ...card, runNowFolders: card.fields.find((field) => field.key === folderFieldKey) };
}

/** What a run somebody asked for is doing, in the shape the source card renders. */
function runRequestFor(
  card: CardId,
  requests: Record<string, RunRequest> | undefined,
): SourceRunRequest | undefined {
  const request = requests?.[PIPELINE_CHANNEL[card]];
  if (!request) return undefined;
  return {
    status: request.status,
    note: request.note,
    processedCount: request.processed_count,
    folderNames: request.folder_names,
  };
}

function treeOptions(folders: FolderOption[] | undefined): FieldOption[] {
  const all = folders ?? [];
  const byParent = new Map<string | null, FolderOption[]>();
  for (const folder of all) {
    const key = folder.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), folder]);
  }
  const knownIds = new Set(all.map((folder) => folder.id));
  const asNode = (folder: FolderOption): FieldOption => ({
    value: folder.id,
    label: folder.name,
    children: (byParent.get(folder.id) ?? []).map(asNode),
  });
  const topLevel = all.filter(
    (folder) => folder.parentId === null || !knownIds.has(folder.parentId),
  );
  return topLevel.map(asNode);
}

/**
 * Names for the ids a source has selected.
 *
 * The live listing is preferred: it is current, and it is the only thing that knows a folder was
 * renamed this morning. `stored` is what channel_folders wrote down when the binding was made,
 * and it is what stops the screen showing a raw 130-character Graph id whenever the provider is
 * unreachable or throttling.
 *
 * The id itself remains the last resort, for a folder bound before names were recorded.
 */
function labelsForIds(
  options: FieldOption[],
  ids: string[],
  stored: Record<string, string> = {},
): string[] {
  const labelByValue = new Map<string, string>();
  const walk = (list: FieldOption[]) => {
    for (const option of list) {
      labelByValue.set(option.value, option.label);
      walk(option.children ?? []);
    }
  };
  walk(options);
  return ids.map((id) => labelByValue.get(id) ?? stored[id] ?? id);
}

function sourceRuns(runs: PipelineRun[], source: string, t: Translate): SourceRun[] {
  return runs
    .filter((run) => run.source === source)
    .slice(0, 5)
    .map((run) => {
      const teile = [formatDateTime(run.started_at)];
      if (run.status === "running") {
        teile.push(t("sources.runs.running"));
      } else {
        teile.push(t("sources.runs.processed", { count: run.processed_count }));
        if (run.error_count > 0) {
          teile.push(t("sources.runs.errors", { count: run.error_count }));
        }
      }
      return {
        text: teile.join(" · "),
        ok: run.status === "ok" && run.error_count === 0,
        running: run.status === "running",
      };
    });
}

function mailSource(
  row: SourceView,
  foldersQuery: FolderListing,
  storedNames: Record<string, string>,
  runs: PipelineRun[],
  actor: SourceActor | string | null,
  runRequest: SourceRunRequest | undefined,
  t: Translate,
): DocumentSource {
  const folderOptions = treeOptions(foldersQuery.data);
  const shared = {
    options: folderOptions,
    optionsLoading: foldersQuery.isLoading,
    optionsError: foldersQuery.isError,
  };
  return {
    id: "mail",
    kind: "mailbox",
    name: t("sources.mail.name"),
    detail: row.address ?? "—",
    icon: MicrosoftIcon,
    status: row.is_active ? "connected" : "not_configured",
    statusDetail: row.is_active
      ? t("sources.mail.active", { count: row.sourceFolders.length })
      : t("sources.inactive"),
    lastChangedBy: actor,
    selectedItems: labelsForIds(folderOptions, row.sourceFolders, storedNames),
    selectedItemsLabel: t("sources.selectedLabel"),
    // Only a spinner when there is nothing to show yet. A stored name is an answer.
    selectedItemsLoading:
      foldersQuery.isLoading && row.sourceFolders.some((id) => !storedNames[id]),
    runs: sourceRuns(runs, PIPELINE_CHANNEL.mail, t),
    runRequest,
    fields: [
      {
        key: "is_active",
        kind: "toggle",
        showInHeader: true,
        label: t("sources.fields.aktiv"),
        value: row.is_active,
      },
      {
        key: "mailbox_address",
        kind: "text",
        label: t("sources.fields.mailAdresse"),
        value: row.address,
      },
      {
        key: "mail_source_folders",
        kind: "multiSelect",
        label: t("sources.fields.quelle"),
        description: t("sources.fields.mailQuelleHint"),
        value: row.sourceFolders,
        ...shared,
      },
      {
        key: "mail_processed_folder",
        kind: "treeSelect",
        label: t("sources.fields.ziel"),
        description: t("sources.fields.mailZielHint"),
        value: row.processedFolder,
        ...shared,
      },
      {
        key: "mail_return_folder",
        kind: "treeSelect",
        label: t("sources.fields.rueckgabe"),
        description: t("sources.fields.mailRueckgabeHint"),
        value: row.returnFolder,
        ...shared,
        advanced: true,
      },
    ],
  };
}

function filingSource(
  row: SourceView,
  foldersQuery: FolderListing,
  storedNames: Record<string, string>,
  runs: PipelineRun[],
  actor: SourceActor | string | null,
  runRequest: SourceRunRequest | undefined,
  t: Translate,
): DocumentSource {
  const folderOptions = treeOptions(foldersQuery.data);
  const shared = {
    options: folderOptions,
    optionsLoading: foldersQuery.isLoading,
    optionsError: foldersQuery.isError,
  };
  return {
    id: "filing",
    kind: "storage",
    name: t("sources.filing.name"),
    detail: t("sources.filing.detail"),
    icon: DropboxIcon,
    status: row.is_active ? "connected" : "not_configured",
    statusDetail: row.is_active
      ? t("sources.filing.active", { count: row.sourceFolders.length })
      : t("sources.inactive"),
    lastChangedBy: actor,
    selectedItems: labelsForIds(folderOptions, row.sourceFolders, storedNames),
    selectedItemsLabel: t("sources.selectedLabel"),
    // Only a spinner when there is nothing to show yet. A stored name is an answer.
    selectedItemsLoading:
      foldersQuery.isLoading && row.sourceFolders.some((id) => !storedNames[id]),
    runs: sourceRuns(runs, PIPELINE_CHANNEL.filing, t),
    runRequest,
    fields: [
      {
        key: "is_active",
        kind: "toggle",
        showInHeader: true,
        label: t("sources.fields.aktiv"),
        value: row.is_active,
      },
      {
        key: "drive_source_folders",
        kind: "multiSelect",
        label: t("sources.fields.quelle"),
        description: t("sources.fields.driveQuelleHint"),
        value: row.sourceFolders,
        ...shared,
      },
      {
        key: "drive_processed_folder",
        kind: "treeSelect",
        label: t("sources.fields.ziel"),
        description: t("sources.fields.driveZielHint"),
        value: row.processedFolder,
        ...shared,
      },
      {
        key: "drive_return_folder",
        kind: "treeSelect",
        label: t("sources.fields.rueckgabe"),
        description: t("sources.fields.driveRueckgabeHint"),
        value: row.returnFolder,
        ...shared,
        advanced: true,
      },
    ],
  };
}

function uploadSource(
  runs: PipelineRun[],
  runRequest: SourceRunRequest | undefined,
  t: Translate,
): DocumentSource {
  return {
    id: "upload",
    kind: "upload",
    name: t("sources.upload.name"),
    detail: t("sources.upload.detail"),
    icon: Upload,
    status: "connected",
    statusDetail: t("sources.upload.status"),
    link: "/eingangsrechnungen/upload",
    runs: sourceRuns(runs, PIPELINE_CHANNEL.upload, t),
    runRequest,
    // Uploading IS the request — invoice-upload.functions.ts asks as the rows are written, so a
    // button here would only offer to do again what already happened.
    asksForItself: true,
    fields: [],
  };
}

export function useDocumentSourcesAdapter(): DocumentSourcesAdapter {
  const { t } = useTranslation();
  const { can } = useAuth();
  // One store, read once. `kind` is the stable word; the keys (microsoft_365, dropbox,
  // hub_upload here) belong to the admin panel and must never be hardcoded.
  const channelsQuery = useChannels();
  const folderRowsQuery = useChannelFolders();
  // MEMOISED ON PURPOSE. hub-kit's settings sheet re-seeds its form from `source.fields` whenever
  // that array's identity changes (useEffect on initialValues). Rebuilding the views on every
  // render handed it a new array each time, so any re-render, including the one a folder selection
  // itself causes, reset the unsaved selection back to the saved value: none. The views are now
  // recomputed only when the rows underneath actually change.
  const channelRows = channelsQuery.data;
  const folderRows = folderRowsQuery.data;
  const { mailView, filingView, storedFolderNames } = useMemo(() => {
    const channels = channelRows ?? [];
    const folders = folderRows ?? [];
    return {
      mailView: viewOf(
        channels.find((c) => c.kind === "mailbox"),
        folders,
        "mailbox",
      ),
      filingView: viewOf(
        channels.find((c) => c.kind === "scan_folder"),
        folders,
        "folder",
      ),
      storedFolderNames: namesOf(folders),
    };
  }, [channelRows, folderRows]);
  const mailboxFoldersQuery = useMailboxFolders();
  const filingFoldersQuery = useFilingFolders();
  // Which listing somebody asked to reload. hub-kit already draws a loader for a field whose
  // options are loading (spinning Refresh icon, "loading" placeholder, disabled picker), but
  // React Query's isLoading is only true on the very first fetch, so pressing Refresh showed
  // nothing. isFetching would, but it also flips on background refetches, and hub-kit resets
  // unsaved edits whenever a field's props change, so a tab regaining focus could throw a
  // selection away. This flag moves only when a person presses Refresh.
  const [refreshing, setRefreshing] = useState<"mail" | "filing" | null>(null);
  // React Query hands back a new result object every render even when nothing changed, so the
  // card is fed only the three values it reads.
  const mailFolders = useMemo<FolderListing>(
    () => ({
      data: mailboxFoldersQuery.data,
      isLoading: mailboxFoldersQuery.isLoading || refreshing === "mail",
      isError: mailboxFoldersQuery.isError,
    }),
    [
      mailboxFoldersQuery.data,
      mailboxFoldersQuery.isLoading,
      mailboxFoldersQuery.isError,
      refreshing,
    ],
  );
  const filingFolders = useMemo<FolderListing>(
    () => ({
      data: filingFoldersQuery.data,
      isLoading: filingFoldersQuery.isLoading || refreshing === "filing",
      isError: filingFoldersQuery.isError,
    }),
    [filingFoldersQuery.data, filingFoldersQuery.isLoading, filingFoldersQuery.isError, refreshing],
  );
  const healthQuery = usePipelineHealth();
  const runRequestsQuery = useRunRequests();
  const runNowEnabled = useRunNowEnabled();
  const askForARun = useAskForARun();
  const updateChannel = useUpdateChannel();
  const saveFolders = useSaveChannelFolders();

  const changedByEmail = mailView?.updatedBy ?? filingView?.updatedBy ?? null;
  const actorQuery = useActorDisplay(changedByEmail);
  const actorName = actorQuery.data?.name;
  const actorRole = actorQuery.data?.roleName;
  const actor = useMemo<SourceActor | string | null>(
    () =>
      changedByEmail
        ? actorName
          ? { name: actorName, role: actorRole ? t(`team.role.${actorRole}`) : undefined }
          : changedByEmail
        : null,
    [changedByEmail, actorName, actorRole, t],
  );

  const lastRun = healthQuery.data?.lastRun;
  const runs = healthQuery.data?.runs ?? NO_RUNS;
  const RUN_INTERVAL_MS = 2 * 3_600_000;
  const nextRunAt = (() => {
    if (!lastRun) return null;
    const base = Date.parse(lastRun.started_at);
    const elapsed = Math.max(0, Date.now() - base);
    const slots = Math.floor(elapsed / RUN_INTERVAL_MS) + 1;
    return new Date(base + slots * RUN_INTERVAL_MS);
  })();

  // The array hub-kit receives. It must keep its identity until something in it really changes;
  // see the note on the memoised views above for what happens when it does not.
  const runRequests = runRequestsQuery.data;
  const sources = useMemo(
    () =>
      mailView && filingView
        ? [
            offeringFolders(
              mailSource(
                mailView,
                mailFolders,
                storedFolderNames,
                runs,
                actor,
                runRequestFor("mail", runRequests),
                t,
              ),
              "mail_source_folders",
            ),
            offeringFolders(
              filingSource(
                filingView,
                filingFolders,
                storedFolderNames,
                runs,
                actor,
                runRequestFor("filing", runRequests),
                t,
              ),
              "drive_source_folders",
            ),
            uploadSource(runs, runRequestFor("upload", runRequests), t),
          ]
        : undefined,
    [
      mailView,
      filingView,
      mailFolders,
      filingFolders,
      storedFolderNames,
      runs,
      actor,
      runRequests,
      t,
    ],
  );

  return {
    useFilingStatus: () => ({
      active: Boolean(mailView?.is_active || filingView?.is_active),
      lastRunLabel: lastRun ? formatDateTime(lastRun.finished_at ?? lastRun.started_at) : null,
      nextRunLabel: nextRunAt ? formatDateTime(nextRunAt.toISOString()) : null,
    }),
    useSources: () => ({
      data: sources,
      isLoading: channelsQuery.isLoading || folderRowsQuery.isLoading,
      isError: channelsQuery.isError || folderRowsQuery.isError,
      error: channelsQuery.error ?? folderRowsQuery.error,
      isRefreshing: channelsQuery.isRefetching || folderRowsQuery.isRefetching,
      refetch: () => {
        void channelsQuery.refetch();
        void folderRowsQuery.refetch();
      },
    }),
    useCanEdit: () => can(PERMISSIONS.settingsManage),
    /**
     * Save one card, spread across the two tables that hold it.
     *
     * The field keys are still the ones this screen has always used. What changed is where each
     * one lands: the switch and the address on `channels`, the folder pickers on
     * `channel_folders`. Both are what the pipeline reads and what the admin panel edits, so a
     * change here shows there and the other way round.
     *
     * Only keys the caller actually sent are written. hub-kit sends the whole field set on save,
     * but an absent key still has to mean "leave it alone" rather than "clear it", or opening the
     * advanced section once would be enough to wipe the return folder.
     */
    saveSource: async (sourceId, values: Record<string, SourceFieldValue>) => {
      const view = sourceId === "mail" ? mailView : filingView;
      if (!view) throw new Error("Diese Quelle ist noch nicht eingerichtet.");
      const has = (key: string) => Object.prototype.hasOwnProperty.call(values, key);
      const addressKey = sourceId === "mail" ? "mailbox" : "folder";
      const sourceKey = sourceId === "mail" ? "mail_source_folders" : "drive_source_folders";
      const processedKey = sourceId === "mail" ? "mail_processed_folder" : "drive_processed_folder";
      const returnKey = sourceId === "mail" ? "mail_return_folder" : "drive_return_folder";
      const addressField = sourceId === "mail" ? "mailbox_address" : null;

      if (has("is_active") || (addressField && has(addressField))) {
        await updateChannel.mutateAsync({
          key: view.channelKey,
          enabled: has("is_active") ? Boolean(values.is_active) : undefined,
          settings:
            addressField && has(addressField)
              ? { [addressKey]: (values[addressField] as string | null) ?? "" }
              : undefined,
        });
      }

      // A tree picker sends one id or null; the bindings table holds a list either way, so null
      // becomes the empty list and the row is removed.
      const asList = (value: SourceFieldValue): string[] =>
        Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];

      const roles: Array<[string, ChannelFolderRole]> = [
        [sourceKey, "source"],
        [processedKey, processedRoleFor(sourceId === "mail" ? "mailbox" : "scan_folder")],
        [returnKey, "not_relevant"],
      ];
      for (const [field, role] of roles) {
        if (!has(field)) continue;
        const ids = asList(values[field]);
        const listing = (sourceId === "mail" ? mailFolders.data : filingFolders.data) ?? [];
        const names = Object.fromEntries(listing.map((folder) => [folder.id, folder.name]));
        await saveFolders.mutateAsync({ channelKey: view.channelKey, role, ids, names });

        // A scan folder's `settings.folder` is the same fact as its source binding, and the admin
        // panel derives one from the other (edit-source.tsx, readsFromFolder). Kept in step here
        // too, or the panel keeps showing a path the Hub has already removed. The pipeline reads
        // the bindings, never this, so it is a label rather than a second source of truth.
        if (sourceId === "filing" && role === "source") {
          await updateChannel.mutateAsync({
            key: view.channelKey,
            settings: { [addressKey]: ids[0] ?? "" },
          });
        }
      }
    },
    refreshOptions: (sourceId) => {
      const which = sourceId === "mail" ? "mail" : "filing";
      const query = which === "mail" ? mailboxFoldersQuery : filingFoldersQuery;
      setRefreshing(which);
      void query.refetch().finally(() => setRefreshing(null));
    },
    // Two conditions, and both are somebody's decision: the admin switched this client on, and
    // this user may change the settings. Without either there is no button at all, rather than a
    // button whose press the pipeline would quietly ignore.
    askForARun:
      runNowEnabled.data && can(PERMISSIONS.settingsManage)
        ? async (sourceId, folders) => {
            const channel = PIPELINE_CHANNEL[sourceId as CardId];
            if (!channel) return;
            await askForARun.mutateAsync({ channel, folders });
          }
        : undefined,
  };
}
