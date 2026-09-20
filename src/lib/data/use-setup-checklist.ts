import { useMemo } from "react";

import {
  CHECKLIST_STEPS,
  type ChecklistData,
  type SetupStepKey,
  type SetupStepState,
} from "@/lib/checklist-config";
import { useAuth } from "@/lib/auth";
import {
  useBankConnections,
  useDatevRoutes,
  useGesellschaften,
  useChannelFolders,
  useChannels,
  useObjekte,
  usePipelineHealth,
} from "@/data";

export type { SetupStepKey, SetupStepState };

export interface SetupStep {
  key: SetupStepKey;
  state: SetupStepState;
  problemCount: number;
  problemKinds: string[];
}

export interface SetupChecklist {
  ready: boolean;
  steps: SetupStep[];
  doneCount: number;
  openCount: number;
  problemCount: number;
}

import { viewOf } from "@/lib/data/channel-sources";

export function useSetupChecklist(): SetupChecklist {
  const { can } = useAuth();

  // The same store the Postfach screen edits, so the checklist cannot disagree with it.
  const channelsQ = useChannels();
  const folderRowsQ = useChannelFolders();
  const bankQ = useBankConnections();
  const companiesQ = useGesellschaften();
  const propertiesQ = useObjekte();
  const datevQ = useDatevRoutes();
  const healthQ = usePipelineHealth();

  return useMemo(() => {
    const ready = [channelsQ, folderRowsQ, bankQ, companiesQ, propertiesQ, datevQ].every(
      (q) => !q.isLoading,
    );
    const channels = channelsQ.data ?? [];
    const folderRows = folderRowsQ.data ?? [];

    const data: ChecklistData = {
      mail: viewOf(
        channels.find((c) => c.kind === "mailbox"),
        folderRows,
        "mailbox",
      ),
      drive: viewOf(
        channels.find((c) => c.kind === "scan_folder"),
        folderRows,
        "folder",
      ),
      bankConnections: bankQ.data ?? [],
      companies: companiesQ.data ?? [],
      properties: propertiesQ.data ?? [],
      datevRoutes: datevQ.data ?? [],
      now: Date.now(),
      errors: {
        mailbox: channelsQ.isError || folderRowsQ.isError,
        bank: bankQ.isError,
        companies: companiesQ.isError,
        properties: propertiesQ.isError,
        datev: datevQ.isError,
      },
      can,
    };

    const steps: SetupStep[] = CHECKLIST_STEPS.filter((step) => step.visible(data)).map((step) => ({
      key: step.key,
      ...step.evaluate(data),
    }));

    return {
      ready,
      steps,
      doneCount: steps.filter((s) => s.state === "done").length,
      openCount: steps.filter((s) => s.state === "open").length,
      problemCount: steps.filter((s) => s.state === "problem").length,
    };
  }, [can, channelsQ, folderRowsQ, bankQ, companiesQ, propertiesQ, datevQ, healthQ]);
}
