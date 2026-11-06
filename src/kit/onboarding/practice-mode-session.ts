import { sb } from "@/data/client";

export const PRACTICE_MODE_HEARTBEAT_MS = 5 * 60 * 1000;

export async function setPracticeMode(active: boolean): Promise<void> {
  const { error } = await sb.rpc("set_practice_mode", { p_active: active });
  if (error) throw error;
}

export async function readPracticeModeActive(): Promise<boolean> {
  const { data, error } = await sb.rpc("practice_mode_active");
  if (error) throw error;
  return data === true;
}

export async function extendPracticeModeIfActive(stillWanted: () => boolean): Promise<boolean> {
  const active = await readPracticeModeActive();
  if (active && stillWanted()) await setPracticeMode(true);
  return active;
}
