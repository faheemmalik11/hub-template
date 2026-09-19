import type { ComponentType } from "react";

import type { QueryResult } from "../lib/query-result";

export type SourceKind = "mailbox" | "storage" | "upload" | "portal";

export type SourceStatus = "connected" | "not_connected" | "not_configured";

export type SourceIcon = ComponentType<{ className?: string }> | { imageSrc: string };

export interface FieldOption {
  value: string;
  label: string;
  children?: FieldOption[];
}

export type SourceFieldValue = string | string[] | boolean | null;

export interface SourceField {
  key: string;
  kind: "select" | "multiSelect" | "treeSelect" | "toggle" | "text";
  /**
   * Whose folders this field picks from, when that is not the source's own provider.
   *
   * A mail channel files its copy into Drive. Without the mark beside the label, step 5 reads as
   * another mailbox folder, which is the one thing it is not.
   */
  icon?: SourceIcon;
  label: string;
  description?: string;
  value: SourceFieldValue;
  options?: FieldOption[];
  optionsLoading?: boolean;
  /**
   * Whether the list of choices failed to load, and why.
   *
   * A string is shown to the reader after the generic sentence. The cause matters here: "not
   * signed in", "the key is not set" and "Google refused the sign-in" are three different jobs for
   * three different people, and a single sentence covering all of them sends everyone to the wrong
   * one.
   */
  optionsError?: boolean | string;
  placeholder?: string;
  advanced?: boolean;
  showInHeader?: boolean;
  // Options for this field come from the CURRENT draft value of another field: the sheet calls
  // the adapter's loadFieldOptions whenever that value changes, and clears this field's own
  // value because a choice made under the old dependency no longer means anything.
  dependsOn?: string;
}

export interface SourceRun {
  text: string;
  ok: boolean;
  running?: boolean;
}

export interface SourceActor {
  name: string;
  role?: string;
}

/** One folder somebody picked for a single run: the provider's id, and what the picker called it. */
export interface RunNowFolder {
  id: string;
  name: string;
}

/** Where a "run now" has got to. Mirrors pipeline_run_requests.status, plus `idle` for "never asked". */
export type RunRequestStatus = "idle" | "pending" | "running" | "done" | "failed";

export interface SourceRunRequest {
  status: RunRequestStatus;
  /** What the pipeline wrote when it finished: the counts, or why it could not run. */
  note?: string | null;
  /** New documents this run found. Null until it has finished. */
  processedCount?: number | null;
  /** The folders this run was asked to read, as the picker named them. Absent for the usual folders. */
  folderNames?: string[] | null;
}

export interface DocumentSource {
  id: string;
  kind: SourceKind;
  name: string;
  detail: string;
  icon: SourceIcon;
  status: SourceStatus;
  statusDetail: string;
  link?: string;
  lastChangedBy?: string | SourceActor | null;
  selectedItems?: string[];
  selectedItemsLabel?: string;
  selectedItemsLoading?: boolean;
  /**
   * A second chip row, for a card that answers two questions at once.
   *
   * A mail channel reads from some folders AND files a copy into another. Those are one setup, and
   * splitting them into two cards invites reading the filing destination as a source documents
   * arrive from.
   */
  secondaryItems?: string[];
  secondaryItemsLabel?: string;
  /** Whose folder the second row names, when it is not the card's own provider. */
  secondaryIcon?: SourceIcon;
  runs?: SourceRun[];
  /** Live state of a run somebody asked for. Absent where the hub has not wired `askForARun`. */
  runRequest?: SourceRunRequest;
  /**
   * This source starts its own run the moment documents arrive, so it carries no button.
   *
   * Upload is the case: putting a file in IS the request, and a button beside it would only
   * offer to do again what already happened. What a run FOUND still shows, so the card still
   * reports itself; only the thing to press is gone.
   */
  asksForItself?: boolean;
  /**
   * The folders this channel can be pointed at for one run, as the settings sheet already lists
   * them. Present means "Run now" opens a dialog offering the channel's own folders or a chosen
   * set; absent means the button simply runs the channel as its schedule would.
   */
  runNowFolders?: SourceField;
  fields: SourceField[];
}

export interface FilingStatus {
  active: boolean;
  lastRunLabel: string | null;
  nextRunLabel?: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface DocumentSourcesAdapter {
  useFilingStatus(): FilingStatus;
  useSources(): QueryResult<DocumentSource[]>;
  useCanEdit?(): boolean;
  saveSource(sourceId: string, values: Record<string, SourceFieldValue>): Promise<void>;
  refreshOptions?(sourceId: string, fieldKey: string): void;
  loadFieldOptions?(
    sourceId: string,
    fieldKey: string,
    dependsOnValue: string,
  ): Promise<FieldOption[]>;
  testConnection?(sourceId: string): Promise<ConnectionTestResult>;
  connect?(sourceId: string): void;
  addSource?(): void;
  /**
   * Ask the pipeline to read this source now, rather than at its next scheduled run.
   *
   * The kit only asks. What it is doing afterwards arrives as `runRequest` on the source, which
   * the hub keeps live — so a run somebody else started shows here too. Leave it out and no
   * button is rendered.
   */
  askForARun?(sourceId: string, folders?: RunNowFolder[]): Promise<void>;
}
