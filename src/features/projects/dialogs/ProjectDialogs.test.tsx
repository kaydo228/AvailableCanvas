/**
 * Проверяется то, что ломается молча: порядок «создать → закрыть → перейти на
 * холст» (FR-01) и защита от двойного клика. Хранилище и роутер подменены —
 * IndexedDB тут не нужна, важна последовательность вызовов.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectDialogs } from '@/features/projects/dialogsStore';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

const repo = vi.hoisted(() => ({
  createProject: vi.fn(async (name: string) => ({
    id: 'p1',
    name,
    createdAt: 0,
    updatedAt: 0,
  })),
  deleteProject: vi.fn(async () => undefined),
  duplicateProject: vi.fn(async () => undefined),
  renameProject: vi.fn(async () => undefined),
  getProject: vi.fn(async () => ({ id: 'p1', name: 'Схема', createdAt: 0, updatedAt: 0 })),
}));
vi.mock('@/features/persistence', () => repo);

const { ProjectDialogs } = await import('./ProjectDialogs');

beforeEach(() => {
  vi.clearAllMocks();
  useProjectDialogs.setState({ kind: null, projectId: null, revision: 0 });
});

afterEach(cleanup);

describe('создание', () => {
  it('после создания закрывает диалог и уводит на холст нового проекта', async () => {
    render(<ProjectDialogs />);
    act(() => useProjectDialogs.getState().openCreate());

    const input = screen.getByLabelText('Имя проекта') as HTMLInputElement;
    expect(input.value).toBe('Новый проект');

    fireEvent.change(input, { target: { value: '  Ретро  ' } });
    fireEvent.click(screen.getByText('Создать'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/p/p1'));
    expect(repo.createProject).toHaveBeenCalledWith('Ретро');
    expect(useProjectDialogs.getState().kind).toBeNull();
  });

  it('двойной клик по «Создать» не рождает два проекта', async () => {
    render(<ProjectDialogs />);
    act(() => useProjectDialogs.getState().openCreate());

    const button = screen.getByText('Создать');
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(repo.createProject).toHaveBeenCalledTimes(1);
  });

  it('пустое имя не отправляется', () => {
    render(<ProjectDialogs />);
    act(() => useProjectDialogs.getState().openCreate());

    fireEvent.change(screen.getByLabelText('Имя проекта'), { target: { value: '   ' } });
    expect((screen.getByText('Создать') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('удаление', () => {
  it('называет проект по имени и удаляет только после подтверждения', async () => {
    render(<ProjectDialogs />);
    act(() => useProjectDialogs.getState().openDelete('p1'));

    await screen.findByText(/Схема/);
    expect(repo.deleteProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Удалить'));

    await waitFor(() => expect(repo.deleteProject).toHaveBeenCalledWith('p1'));
    expect(useProjectDialogs.getState().revision).toBe(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('дублирование', () => {
  it('обновляет список и остаётся на нём', async () => {
    render(<ProjectDialogs />);
    act(() => useProjectDialogs.getState().openDuplicate('p1'));

    fireEvent.click(screen.getByText('Дублировать'));

    await waitFor(() => expect(repo.duplicateProject).toHaveBeenCalledWith('p1'));
    expect(useProjectDialogs.getState().revision).toBe(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});
