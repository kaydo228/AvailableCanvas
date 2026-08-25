import { beforeEach, expect, test } from 'vitest';

import { useInspector } from './store';

beforeEach(() => useInspector.setState(useInspector.getInitialState()));

test('toggleCollapsed переключает панель туда и обратно', () => {
  const { toggleCollapsed } = useInspector.getState();

  toggleCollapsed();
  expect(useInspector.getState().collapsed).toBe(true);

  toggleCollapsed();
  expect(useInspector.getState().collapsed).toBe(false);
});
