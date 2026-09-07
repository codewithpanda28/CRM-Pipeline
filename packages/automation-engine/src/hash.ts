import { createHash } from 'node:crypto';

/** Deterministic JSON canonicalize (sorted object keys). */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortValue(obj[key]);
  }
  return out;
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value)).digest('hex');
}

export function schemaHashForGraph(graph: Record<string, unknown>): string {
  return sha256Canonical(graph);
}
