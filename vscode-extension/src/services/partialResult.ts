/**
 * Interpreting the backend's "partial success" signal.
 *
 * /api/process can come back with partial=true and a dropped_items payload
 * whose every category is empty - observed live on a README.md run that
 * had already been corrected twice and ended up dropping nothing. Taken at
 * face value that produced a warning notification, a warning status bar
 * and the message "PDF generated with 0 item(s) excluded (evidence not
 * grounded)" for a document where the PDF was in fact complete.
 *
 * So the flag alone doesn't decide: a run is only partial if something was
 * actually excluded. Pure (no vscode import) so both the pipeline's branch
 * and the notification's wording use exactly the same count.
 */

/** Total number of excluded items across every dropped_items category. */
export function countDroppedItems(dropped: Record<string, string[]> | undefined | null): number {
  if (!dropped || typeof dropped !== 'object') {
    return 0;
  }
  return Object.values(dropped).reduce(
    (total, items) => total + (Array.isArray(items) ? items.filter((item) => typeof item === 'string').length : 0),
    0
  );
}

/**
 * Whether a successful response should be reported as a partial success.
 * Requires both the backend's flag and at least one genuinely dropped
 * item - the flag on its own says only that grounding validation ran.
 */
export function isPartialSuccess(
  partial: boolean | undefined,
  dropped: Record<string, string[]> | undefined | null
): boolean {
  return partial === true && countDroppedItems(dropped) > 0;
}

/**
 * Human-readable list of what was excluded, e.g.
 * "diagrams: Data Flow; glossary_entries: idempotent". Empty categories
 * are skipped so the message names only what actually went missing.
 */
export function describeDroppedItems(dropped: Record<string, string[]> | undefined | null): string {
  if (!dropped || typeof dropped !== 'object') {
    return '';
  }
  return Object.entries(dropped)
    .map(([category, items]) => {
      const names = Array.isArray(items) ? items.filter((item) => typeof item === 'string') : [];
      return names.length > 0 ? `${category}: ${names.join(', ')}` : '';
    })
    .filter((part) => part.length > 0)
    .join('; ');
}
