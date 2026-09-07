import { describe, it, expect } from 'vitest';
import {
  sha256Canonical,
  canonicalizeJson,
  schemaHashForGraph,
  getActionClass,
  assertPublishableAction,
} from './index';

describe('hash / canonicalize', () => {
  it('is order-insensitive for objects', () => {
    const a = sha256Canonical({ b: 1, a: 2 });
    const b = sha256Canonical({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('detects payload tamper', () => {
    const snap = { action_type: 'critical.stub', params: { x: 1 } };
    const hash = sha256Canonical(snap);
    expect(sha256Canonical({ ...snap, params: { x: 2 } })).not.toBe(hash);
  });

  it('schema_hash stable', () => {
    const g = { nodes: [{ id: 'a', type: 'action' }], edges: [] };
    expect(schemaHashForGraph(g)).toBe(schemaHashForGraph({ edges: [], nodes: [{ type: 'action', id: 'a' }] }));
  });
});

describe('action registry', () => {
  it('classifies A/B/C', () => {
    expect(getActionClass('task.create')).toBe('A');
    expect(getActionClass('critical.stub')).toBe('B');
    expect(getActionClass('data.purge')).toBe('C');
  });

  it('blocks Class C at publish assert', () => {
    expect(() => assertPublishableAction('data.purge')).toThrow(/CLASS_C/);
  });

  it('blocks reserved Voice/WhatsApp', () => {
    expect(() => assertPublishableAction('voice.call.enqueue')).toThrow(/NOT_IMPLEMENTED/);
  });
});

describe('canonicalizeJson', () => {
  it('sorts nested keys', () => {
    expect(canonicalizeJson({ z: { b: 1, a: 2 } })).toBe(canonicalizeJson({ z: { a: 2, b: 1 } }));
  });
});
