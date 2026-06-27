/** Extract placeholders like {{name}} from a string. Returns deduped, ordered list. */
export function extractPlaceholders(...sources: string[]): string[] {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of sources) {
    for (const m of src.matchAll(re)) {
      const key = m[1];
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/** Replace {{var}} placeholders in template with values map. Missing vars become empty. */
export function applyPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

/** Human-friendly label from snake_case key */
export function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
