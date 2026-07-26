import { emptyState, norm, modelStatus } from './health';

describe('health utils', () => {
  test('emptyState returns correct structure', () => {
    const state = emptyState();
    expect(state).toHaveProperty('lastCheckedAt', null);
    expect(state).toHaveProperty('intervalMinutes');
    expect(typeof state.intervalMinutes).toBe('number');
    expect(state).toHaveProperty('providers');
    expect(state.providers).toEqual({});
    expect(state).toHaveProperty('actions');
    expect(state.actions).toEqual([]);
  });

  test('norm strips opencode prefix and lowercases', () => {
    expect(norm('opencode/Qwen/Qwen2.5-Coder-32B-Instruct')).toBe('qwen/qwen2.5-coder-32b-instruct');
    expect(norm('Qwen/Qwen2.5-Coder-32B-Instruct')).toBe('qwen/qwen2.5-coder-32b-instruct');
    expect(norm('  Foo/Bar  ')).toBe('foo/bar');
  });

  test('modelStatus returns true when model present', () => {
    const ids = ['foo/bar', 'baz/qux'];
    expect(modelStatus(ids, 'foo/bar')).toBe(true);
    expect(modelStatus(ids, 'BAZ/QUX')).toBe(true); // case insensitive
    expect(modelStatus(ids, 'unknown')).toBe(false);
    expect(modelStatus(null, 'any')).toBeNull();
    expect(modelStatus(undefined, 'any')).toBeNull();
  });
});
