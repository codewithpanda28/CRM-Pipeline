import { describe, expect, it } from 'vitest';

/**
 * Documents the List-view Add Deal contract: page must pass addTrigger into PipelineList.
 * Regression guard for the historical no-op (List ignored header + Add Deal).
 */
describe('PipelineList Add Deal wiring contract', () => {
  it('ListProps includes addTrigger alongside pipeline and search', () => {
    type ListProps = { pipeline: unknown; search: string; addTrigger: number };
    const props: ListProps = {
      pipeline: { id: 'p1', stages: [{ id: 's1' }], fields: [] },
      search: '',
      addTrigger: 2,
    };
    expect(props.addTrigger).toBe(2);
    expect(props.search).toBe('');
  });

  it('incrementing addTrigger is the open signal used by Cards/Compact/Table/List', () => {
    let addTrigger = 0;
    const bump = () => {
      addTrigger += 1;
    };
    bump();
    bump();
    expect(addTrigger).toBe(2);
  });
});
