const STUCK_AFTER_MS = 5 * 60 * 1000;

// A platform-level kill (timeout, restart, out of memory) can end an Edge Function invocation
// without its own catch block ever running, leaving lexoffice_sync_requested_at set forever with
// no error. Past this many minutes, treat it as failed so the UI offers a retry instead of an
// unending spinner.
export function lexofficeSyncIsStuck(requestedAt: string | null | undefined): boolean {
  if (!requestedAt) return false;
  return Date.now() - new Date(requestedAt).getTime() > STUCK_AFTER_MS;
}
