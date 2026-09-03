/**
 * Применение решений. Сами операции подменены — проверяется, что каждое
 * решение вызывает своё действие и ровно один раз: молчаливое «скачали вместо
 * выгрузили» стирает работу, и увидеть это постфактум нечем.
 */

import { describe, expect, it, vi } from 'vitest';

import { applyDecisions } from './pull';

const spies = () => ({
  push: vi.fn(async () => true),
  pull: vi.fn(async () => true),
  deleteLocal: vi.fn(async () => {}),
});

describe('applyDecisions', () => {
  it('каждое решение зовёт своё действие', async () => {
    const actions = spies();

    await applyDecisions(
      [
        { kind: 'push', projectId: 'a' },
        { kind: 'pull', projectId: 'b' },
        { kind: 'delete-local', projectId: 'c' },
        { kind: 'nothing', projectId: 'd' },
      ],
      actions,
    );

    expect(actions.push).toHaveBeenCalledTimes(1);
    expect(actions.push).toHaveBeenCalledWith('a');
    expect(actions.pull).toHaveBeenCalledTimes(1);
    expect(actions.pull).toHaveBeenCalledWith('b');
    expect(actions.deleteLocal).toHaveBeenCalledTimes(1);
    expect(actions.deleteLocal).toHaveBeenCalledWith('c');
  });

  it('отказ на одной доске не останавливает остальные', async () => {
    const actions = spies();
    actions.push.mockRejectedValueOnce(new Error('нет сети'));

    await applyDecisions(
      [
        { kind: 'push', projectId: 'a' },
        { kind: 'pull', projectId: 'b' },
      ],
      actions,
    );

    expect(actions.pull).toHaveBeenCalledTimes(1);
    expect(actions.pull).toHaveBeenCalledWith('b');
  });
});
