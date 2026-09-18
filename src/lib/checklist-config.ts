import type { BankConnection, DatevRoute, Gesellschaft, Objekt } from "@/lib/data/types";
import type { SourceView } from "@/lib/data/channel-sources";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

export type SetupStepKey = "mailbox" | "bank" | "companies" | "properties" | "datev";
export type SetupStepState = "done" | "open" | "problem";

export interface ChecklistStepResult {
  state: SetupStepState;
  problemCount: number;
  problemKinds: string[];
}

export interface ChecklistStepLink {
  to: string;
  search?: Record<string, unknown>;
  hash?: string;
}

export interface ChecklistData {
  // Derived from channels + channel_folders (src/lib/data/channel-sources.ts), which is the
  // store the pipeline reads. It used to be a mail_settings row, the Hub's own copy.
  mail: SourceView | undefined;
  drive: SourceView | undefined;
  bankConnections: BankConnection[];
  companies: Gesellschaft[];
  properties: Objekt[];
  datevRoutes: DatevRoute[];
  now: number;
  errors: Record<SetupStepKey, boolean>;
  can: (permission: PermissionKey) => boolean;
}

export interface ChecklistStepConfig {
  key: SetupStepKey;
  editPermission?: PermissionKey;
  visible: (d: ChecklistData) => boolean;
  evaluate: (d: ChecklistData) => ChecklistStepResult;
  link: (state: SetupStepState, problemKinds: string[]) => ChecklistStepLink;
}

const STALE_LIMIT_MS = 26 * 60 * 60 * 1000;

const MAILBOX_FOKUS: Record<string, { hash: string; fokus: string }> = {
  "mail-address": { hash: "mail", fokus: "mailbox_address" },
  mail: { hash: "mail", fokus: "mail_processed_folder" },
  "drive-sources": { hash: "filing", fokus: "drive_source_folders" },
  drive: { hash: "filing", fokus: "drive_processed_folder" },
};

export const CHECKLIST_STEPS: ChecklistStepConfig[] = [
  {
    key: "mailbox",
    editPermission: PERMISSIONS.postfachSettings,
    visible: (d) => !d.errors.mailbox,
    evaluate: (d) => {
      const active = Boolean(d.mail?.is_active || d.drive?.is_active);
      const kinds: string[] = [];
      if (d.mail?.is_active) {
        if (!d.mail.address) kinds.push("mail-address");
        if (!d.mail.processedFolder) kinds.push("mail");
      }
      if (d.drive?.is_active) {
        if (d.drive.sourceFolders.length === 0) kinds.push("drive-sources");
        if (!d.drive.processedFolder) kinds.push("drive");
      }
      return {
        state: !active ? "open" : kinds.length > 0 ? "problem" : "done",
        problemCount: kinds.length,
        problemKinds: kinds,
      };
    },
    link: (state, kinds) => {
      if (state !== "problem") return { to: "/postfach" };
      const hit = (kinds[0] && MAILBOX_FOKUS[kinds[0]]) || MAILBOX_FOKUS.mail;
      return { to: "/postfach", hash: hit.hash, search: { fokus: hit.fokus } };
    },
  },
  {
    key: "bank",
    visible: (d) => d.can(PERMISSIONS.pageBankverbindungen) && !d.errors.bank,
    evaluate: (d) => {
      const staleBefore = d.now - STALE_LIMIT_MS;
      const live = d.bankConnections.filter((c) => !c.disconnected_at);
      const broken = live.filter(
        (c) =>
          c.status === "error" ||
          c.status === "expired" ||
          (c.status === "active" &&
            c.last_sync_at !== null &&
            Date.parse(c.last_sync_at) < staleBefore),
      );
      const hasActive = live.some((c) => c.status === "active" && !broken.includes(c));
      return {
        state: broken.length > 0 ? "problem" : hasActive ? "done" : "open",
        problemCount: broken.length,
        problemKinds: broken.length > 0 ? ["connection"] : [],
      };
    },
    link: () => ({ to: "/bankkonten", search: { fokus: "verbindungen" } }),
  },
  {
    key: "companies",
    visible: (d) => !d.errors.companies,
    evaluate: (d) => ({
      state: d.companies.length === 0 ? "open" : "done",
      problemCount: 0,
      problemKinds: [],
    }),
    link: () => ({ to: "/gesellschaften", search: { fokus: "liste" } }),
  },
  {
    key: "properties",
    visible: (d) => !d.errors.properties,
    evaluate: (d) => ({
      state: d.properties.length === 0 ? "open" : "done",
      problemCount: 0,
      problemKinds: [],
    }),
    link: () => ({ to: "/objekte", search: { fokus: "liste" } }),
  },
  {
    key: "datev",
    visible: (d) => !d.errors.datev,
    evaluate: (d) => {
      const enabledIds = new Set(
        d.datevRoutes
          .filter((r) => r.direction === "incoming" && r.is_enabled)
          .map((r) => r.company_id),
      );
      const covered = d.companies.filter((g) => enabledIds.has(g.id)).length;
      const uncovered = d.companies.length - covered;
      return {
        state: covered === 0 ? "open" : uncovered > 0 ? "problem" : "done",
        problemCount: uncovered,
        problemKinds: uncovered > 0 ? ["coverage"] : [],
      };
    },
    link: () => ({ to: "/datev-uebergabe", search: { fokus: "liste" } }),
  },
];

export function checklistStepLink(
  key: SetupStepKey,
  state: SetupStepState | string,
  problemKinds: string[],
): ChecklistStepLink {
  const step = CHECKLIST_STEPS.find((s) => s.key === key);
  if (!step) return { to: "/onboarding" };
  return step.link(state as SetupStepState, problemKinds);
}

export function checklistStepUserLink(
  key: SetupStepKey,
  state: SetupStepState | string,
  problemKinds: string[],
  can: (permission: PermissionKey) => boolean,
): ChecklistStepLink | undefined {
  const step = CHECKLIST_STEPS.find((s) => s.key === key);
  if (!step) return undefined;
  if (step.editPermission && !can(step.editPermission)) return undefined;
  return step.link(state as SetupStepState, problemKinds);
}

export function checklistStepDescription(
  t: (key: string, options?: Record<string, unknown>) => string,
  step: { key: SetupStepKey; state: SetupStepState; problemCount: number; problemKinds: string[] },
): string {
  if (step.key === "mailbox" && step.state === "problem" && step.problemKinds.length > 0) {
    const first = t(`home.setupWarning.folder-${step.problemKinds[0]}.message`);
    if (step.problemKinds.length === 1) return first;
    return `${first} ${t("checklist.step.mailbox.moreProblems", {
      count: step.problemKinds.length - 1,
    })}`;
  }
  return t(`checklist.step.${step.key}.${step.state}`, { count: step.problemCount });
}

export function checklistStepProblems(
  t: (key: string, options?: Record<string, unknown>) => string,
  step: { key: SetupStepKey; state: SetupStepState; problemKinds: string[] },
): { text: string; link?: ChecklistStepLink }[] {
  if (step.key !== "mailbox" || step.state !== "problem") return [];
  return step.problemKinds.map((kind) => ({
    text: t(`home.setupWarning.folder-${kind}.message`),
    link: checklistStepLink("mailbox", "problem", [kind]),
  }));
}
