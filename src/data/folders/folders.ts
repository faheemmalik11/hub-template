import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { SINGLETON_ROW_ID, STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, requiredReason } from "@/data/shared";
import { getFilingFolders, getMailboxFolders } from "@/lib/api/inbox-folders.functions";
import { getActorDisplay, type ActorDisplay } from "@/lib/api/actor-display.functions";
import type { Channel, ChannelFolder, ChannelFolderRole } from "@/lib/data/types";

// ---- Mail and Drive settings: RETIRED ----
//
// mail_settings was the Hub's own copy of the document-source configuration, while the pipeline
// read `channels` + `channel_folders`. Two stores for one fact: changing a folder here saved
// successfully and changed nothing about what got ingested.
//
// The hooks that read and wrote it are gone. The table itself is left in place, with its rows: it
// is still the fallback for a tenant whose storage.channel_config resolves to `mail_settings`
// rather than `channels`, which this client's no longer does. See useChannels() below and
// docs/TABLE_NAMING_MIGRATION.md.

// ---- Postfach folder pickers (Briefing Screen 1: pick a real folder, don't type its id) ----
//
// Longer staleTime than the usual data queries: a mailbox's/app folder's structure changes rarely
// (a person creating a new folder is an occasional, deliberate act), and every open of the
// Postfach screen re-running a live Graph/Dropbox call would be a slow, easily-avoided round trip
// for data that is essentially static within a session.
const INBOX_FOLDERS_STALE = 5 * 60_000;

export function useActorDisplay(email: string | null) {
  return useQuery({
    queryKey: ["actor_display", email],
    staleTime: INBOX_FOLDERS_STALE,
    enabled: Boolean(email),
    queryFn: async (): Promise<ActorDisplay> =>
      getActorDisplay({ data: { email: email as string } }),
  });
}

/**
 * The document sources, as the pipeline and the admin panel hold them.
 *
 * One store, two editors. The panel provisions a channel and its credentials; the Hub edits which
 * folders it reads and where it files. Both read these tables, so a change in either shows in the
 * other. mail_settings was the Hub's separate copy of the same fact and is no longer read.
 */
export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    staleTime: STALE,
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await sb
        .from(TABLE.channels)
        .select(
          "key, kind, provider, enabled, provider_ref, settings, position, updated_by, updated_at",
        )
        .order("position")
        .order("key");
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });
}

export function useChannelFolders() {
  return useQuery({
    queryKey: ["channel_folders"],
    staleTime: STALE,
    queryFn: async (): Promise<ChannelFolder[]> => {
      const { data, error } = await sb
        .from(TABLE.channelFolders)
        .select("channel_key, identity, role, external_id, display_name, well_known_name, position")
        .order("position");
      if (error) throw error;
      return (data ?? []) as ChannelFolder[];
    },
  });
}

/**
 * Change a channel's own settings: whether it runs, and the one address or path it points at.
 *
 * `settings` is merged, never replaced. The column is shared with the pipeline and the panel, and
 * it carries keys this screen knows nothing about (a bucket, a provider hint). Writing a whole
 * object would drop them.
 *
 * The write REPORTS ITSELF, the same reasoning as mail_settings before it: an RLS-blocked update
 * matches no rows and returns success, so without the returned row a person without
 * postfach.settings would click Speichern, see "gespeichert", and have changed nothing.
 */
export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      key: string;
      enabled?: boolean;
      settings?: Record<string, unknown>;
    }) => {
      const actor = await actorEmail();
      const patch: Record<string, unknown> = {
        updated_by: actor,
        updated_at: new Date().toISOString(),
      };
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      if (args.settings) {
        const { data: current, error: readError } = await sb
          .from(TABLE.channels)
          .select("settings")
          .eq("key", args.key)
          .maybeSingle();
        if (readError) throw readError;
        patch.settings = {
          ...(((current as { settings?: Record<string, unknown> } | null)?.settings ??
            {}) as Record<string, unknown>),
          ...args.settings,
        };
      }
      const { data, error } = await sb
        .from(TABLE.channels)
        .update(patch)
        .eq("key", args.key)
        .select("key");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Diese Einstellungen dürfen nur Administratoren ändern. Es wurde nichts gespeichert.",
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

/**
 * Replace the folders bound to one channel in one role.
 *
 * A set difference, not an update: a folder that is still ticked keeps its row, and with it the
 * display name and the delta bookmark scoped to that row. Deleting and re-inserting everything
 * would throw both away and make the next run re-read every folder.
 *
 * `identity` is taken from the rows already there, because it is the account the bindings belong
 * to and only the connection knows it. 'app' is the fallback, which is what a tenant
 * authenticating as the application uses.
 */
export function useSaveChannelFolders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      channelKey: string;
      role: ChannelFolderRole;
      ids: string[];
      // The name the picker showed, so a binding made here reads as a name in the panel and in
      // the Hub's own fallback, the way one made in the panel already does.
      names?: Record<string, string>;
    }) => {
      const actor = await actorEmail();
      const { data: existingRows, error: readError } = await sb
        .from(TABLE.channelFolders)
        .select("external_id, identity")
        .eq("channel_key", args.channelKey)
        .eq("role", args.role);
      if (readError) throw readError;
      const existing = (existingRows ?? []) as Array<{ external_id: string; identity: string }>;
      const identity = existing[0]?.identity ?? "app";
      const have = new Set(existing.map((row) => row.external_id));
      const want = new Set(args.ids);

      const gone = [...have].filter((id) => !want.has(id));
      if (gone.length > 0) {
        const { error } = await sb
          .from(TABLE.channelFolders)
          .delete()
          .eq("channel_key", args.channelKey)
          .eq("role", args.role)
          .in("external_id", gone);
        if (error) throw error;
      }

      const added = args.ids.filter((id) => !have.has(id));
      if (added.length > 0) {
        const { error } = await sb.from(TABLE.channelFolders).insert(
          added.map((id) => ({
            channel_key: args.channelKey,
            identity,
            role: args.role,
            external_id: id,
            display_name: args.names?.[id] ?? null,
            position: args.ids.indexOf(id),
            added_at: new Date().toISOString(),
            added_by: actor,
          })),
        );
        if (error) throw error;
      }

      // Nothing added and nothing removed still has to report itself, or a person without
      // postfach.settings sees a silent success. A delete that matches no row is not an error.
      if (gone.length === 0 && added.length === 0) return;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["channel_folders"] });
    },
  });
}

export function useMailboxFolders(enabled = true) {
  return useQuery({
    queryKey: ["postfach_mailbox_folders"],
    staleTime: INBOX_FOLDERS_STALE,
    enabled,
    queryFn: () => getMailboxFolders(),
  });
}

export function useFilingFolders(enabled = true) {
  return useQuery({
    queryKey: ["postfach_filing_folders"],
    staleTime: INBOX_FOLDERS_STALE,
    enabled,
    queryFn: () => getFilingFolders(),
  });
}
