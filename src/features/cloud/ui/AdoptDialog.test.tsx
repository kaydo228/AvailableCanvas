/**
 * Диалог модальный и перекрывает всё приложение — поэтому проверяется не
 * счастливый путь, а два способа остаться в нём навсегда или потерять ответ:
 * отказ записи (флаг занятости не снимался) и закрытие по Escape (записывался
 * отказ, о котором человека не спрашивали, а спросить повторно негде).
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adopt = vi.hoisted(() => ({
  adoptBoards: vi.fn(async () => undefined),
  declineAdoption: vi.fn(async () => undefined),
}));
vi.mock('../model/adopt', () => adopt);

const runSyncCycle = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../model/useCloudSyncOnLogin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/useCloudSyncOnLogin')>()),
  runSyncCycle,
}));

const { useAdoptQuestion } = await import('../model/useCloudSyncOnLogin');
const { AdoptDialog } = await import('./AdoptDialog');

const ask = () =>
  act(() =>
    useAdoptQuestion.getState().ask({
      ids: ['a'],
      owner: 'user-1',
      email: 'test@example.com',
      cycle: Promise.resolve(),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  useAdoptQuestion.setState({ question: null });
});

afterEach(cleanup);

describe('AdoptDialog', () => {
  it('отказ записи не оставляет диалог висеть навсегда', async () => {
    adopt.adoptBoards.mockRejectedValueOnce(new Error('IndexedDB недоступна'));
    render(<AdoptDialog />);
    ask();

    fireEvent.click(screen.getByText('Перенести'));

    await waitFor(() => expect(useAdoptQuestion.getState().question).toBeNull());
  });

  it('закрытие по Escape не записывает отказ', async () => {
    render(<AdoptDialog />);
    ask();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(useAdoptQuestion.getState().question).toBeNull());
    expect(adopt.declineAdoption).not.toHaveBeenCalled();
  });

  it('«Оставить локальными» — это ответ, и он записывается', async () => {
    render(<AdoptDialog />);
    ask();

    fireEvent.click(screen.getByText('Оставить локальными'));

    await waitFor(() => expect(adopt.declineAdoption).toHaveBeenCalledWith(['a']));
  });
});
