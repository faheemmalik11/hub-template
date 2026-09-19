import { buildPaymentFiles, type FileNamePattern } from "./build-file";
import { prepareRun } from "./prepare-run";
import { resolveSettings } from "./settings";
import type { BuildOptions, BuiltPaymentRun } from "./types";

export interface BuildPaymentRunOptions extends BuildOptions {
  fileName?: FileNamePattern;
}

export function buildPaymentRun(options: BuildPaymentRunOptions): BuiltPaymentRun {
  const prepared = prepareRun(options);
  if (prepared.blocker) return { ...prepared, files: [] };

  return {
    ...prepared,
    files: buildPaymentFiles(prepared.accepted, {
      payer: options.payer,
      messageId: options.messageId,
      today: options.today,
      settings: resolveSettings(options.settings),
      fileName: options.fileName,
    }),
  };
}
