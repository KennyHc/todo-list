import { TASK_COLORS } from './colors';

describe('colors', () => {
  it('should have 8 task colors', () => {
    expect(TASK_COLORS).toHaveLength(8);
  });
});
