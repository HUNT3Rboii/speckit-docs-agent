import { parseProgressSignal } from './progressSignal';

describe('parseProgressSignal', () => {
  it('parses a valid in_progress signal', () => {
    const signal = parseProgressSignal(
      JSON.stringify({ source_path: 'specs/demo/tasks.md', task_key: 'T003', status: 'in_progress' })
    );

    expect(signal).toEqual({ source_path: 'specs/demo/tasks.md', task_key: 'T003', status: 'in_progress' });
  });

  it('parses a valid done signal', () => {
    const signal = parseProgressSignal(
      JSON.stringify({ source_path: 'specs/demo/tasks.md', task_key: 'T003', status: 'done' })
    );

    expect(signal?.status).toBe('done');
  });

  it('returns null for invalid JSON (e.g. a partially-written file)', () => {
    expect(parseProgressSignal('{ "source_path": "specs/demo')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseProgressSignal(JSON.stringify({ task_key: 'T003', status: 'done' }))).toBeNull();
    expect(parseProgressSignal(JSON.stringify({ source_path: 'specs/demo/tasks.md', status: 'done' }))).toBeNull();
    expect(parseProgressSignal(JSON.stringify({ source_path: 'specs/demo/tasks.md', task_key: 'T003' }))).toBeNull();
  });

  it('returns null for an unrecognized status value', () => {
    expect(
      parseProgressSignal(
        JSON.stringify({ source_path: 'specs/demo/tasks.md', task_key: 'T003', status: 'complete' })
      )
    ).toBeNull();
  });

  it('returns null for a JSON array or primitive rather than an object', () => {
    expect(parseProgressSignal('[]')).toBeNull();
    expect(parseProgressSignal('"just a string"')).toBeNull();
    expect(parseProgressSignal('42')).toBeNull();
    expect(parseProgressSignal('null')).toBeNull();
  });

  it('accepts the todo status too (not just in_progress/done)', () => {
    expect(
      parseProgressSignal(JSON.stringify({ source_path: 'specs/demo/tasks.md', task_key: 'T003', status: 'todo' }))
    ).toEqual({ source_path: 'specs/demo/tasks.md', task_key: 'T003', status: 'todo' });
  });
});
