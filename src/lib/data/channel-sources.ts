/**
 * One document source, as the two tables that hold it describe it.
 *
 * `channels` carries whether a source runs and the one address or path it points at;
 * `channel_folders` carries the folders bound to it. Shared by the Postfach screen and the setup
 * checklist so the two cannot drift, which is the mistake this whole move exists to undo:
 * mail_settings was the Hub's own copy of a fact the pipeline read somewhere else.
 */
import {
  processedRoleFor,
  type Channel,
  type ChannelFolder,
  type ChannelFolderRole,
} from "@/lib/data/types";

/**
 * One source card's worth of configuration, read out of `channels` + `channel_folders`.
 *
 * The card fields keep the names they had when this screen read mail_settings, because those
 * names are the contract with the kit and with the German labels. Only where the values come
 * from has changed.
 */
export type SourceView = {
  channelKey: string;
  is_active: boolean;
  address: string | null;
  sourceFolders: string[];
  processedFolder: string | null;
  returnFolder: string | null;
  updatedBy: string | null;
};

export function viewOf(
  channel: Channel | undefined,
  folders: ChannelFolder[],
  addressKey: string,
): SourceView | undefined {
  if (!channel) return undefined;
  const mine = folders.filter((f) => f.channel_key === channel.key);
  const inRole = (role: ChannelFolderRole) =>
    mine
      .filter((f) => f.role === role)
      .sort((a, b) => a.position - b.position)
      .map((f) => f.external_id);
  const settings = (channel.settings ?? {}) as Record<string, unknown>;
  const address = settings[addressKey];
  return {
    channelKey: channel.key,
    is_active: channel.enabled,
    // provider_ref is where the address used to live. Read as a fallback so a channel the panel
    // wrote before it moved into settings still shows one.
    address: typeof address === "string" && address ? address : channel.provider_ref,
    sourceFolders: inRole("source"),
    processedFolder: inRole(processedRoleFor(channel.kind))[0] ?? null,
    returnFolder: inRole("not_relevant")[0] ?? null,
    updatedBy: channel.updated_by,
  };
}

/** The stored names, so a folder reads as a name when its provider cannot be reached. */
export function namesOf(folders: ChannelFolder[]): Record<string, string> {
  const byId: Record<string, string> = {};
  for (const f of folders) if (f.display_name) byId[f.external_id] = f.display_name;
  return byId;
}
