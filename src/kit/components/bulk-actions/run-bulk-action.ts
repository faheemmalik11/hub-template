export interface BulkActionResult {
  succeeded: number;
  failed: number;
  /** The first thing that went wrong, for the message shown to the user. */
  firstError: unknown;
}

/**
 * Applies one action to every selected id, one call at a time.
 *
 * Sequential on purpose. Each row is its own write and its own audit entry, and a failure on one
 * row must not take the others down with it.
 */
export async function runBulkAction(
  ids: string[],
  run: (id: string, value: string | null) => Promise<void>,
  value: string | null,
): Promise<BulkActionResult> {
  let succeeded = 0;
  let failed = 0;
  let firstError: unknown = null;

  for (const id of ids) {
    try {
      await run(id, value);
      succeeded++;
    } catch (error) {
      failed++;
      if (firstError === null) firstError = error;
    }
  }

  return { succeeded, failed, firstError };
}
