import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useShortcuts } from '@/features/shortcuts/model/useShortcuts';
import { useBoardStore } from '@/shared/store/board';
import type { DesignCard } from '@/shared/types/design';
import type { BoardDocument, ShapeNode } from '@/shared/types/document';
import { DesignInspector } from './DesignInspector';
import { DesignSidebar } from './DesignSidebar';
import { DesignTools } from './DesignTools';

const card = (id: string, title: string): ShapeNode => ({
  id,
  type: 'shape',
  shape: 'roundRect',
  x: 0,
  y: 0,
  width: 280,
  height: 180,
  rotation: 0,
  opacity: 1,
  locked: false,
  fill: '#fff',
  stroke: '#ccc',
  strokeWidth: 1,
  design: {
    kind: 'card',
    cardType: 'mechanic',
    title,
    summary: '',
    status: 'idea',
    implementation: 'not-started',
    tags: [],
    fields: {},
    references: [],
    comments: [],
    table: { columns: [], rows: [] },
  },
});
const fixture = (): BoardDocument => ({
  projectId: 'test',
  schemaVersion: 1,
  nodes: { a: card('a', 'Рывок'), b: card('b', 'Выносливость') },
  order: ['a', 'b'],
  viewport: { x: 0, y: 0, zoom: 1 },
  background: { color: '#fff', grid: 'none' },
});
const design = (id = 'a') =>
  (useBoardStore.getState().document?.nodes[id] as ShapeNode | undefined)?.design as DesignCard;
const Inspector = () => {
  const node = useBoardStore((s) => s.document?.nodes.a as ShapeNode);
  return <DesignInspector node={node} />;
};
beforeEach(() =>
  useBoardStore.setState({ document: fixture(), selection: [], editingNodeId: null }),
);
afterEach(cleanup);

describe('design panels', () => {
  it('keeps reading available but removes version controls when editing is revoked', () => {
    const { rerender } = render(<DesignTools name="Game" />);
    fireEvent.click(screen.getByRole('button', { name: 'Версии' }));
    expect(screen.getByRole('button', { name: 'Сохранить версию' })).toBeTruthy();
    rerender(<DesignTools name="Game" readOnly />);
    expect(screen.queryByRole('button', { name: 'Сохранить версию' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Версии' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Читать диздок' }));
    expect(screen.getByRole('button', { name: 'Скачать Markdown' })).toBeTruthy();
  });

  it('edits canonical card fields, table cells and comments in the real document', () => {
    render(<Inspector />);
    fireEvent.change(screen.getByLabelText('Название карточки'), {
      target: { value: 'Быстрый рывок' },
    });
    fireEvent.change(screen.getByLabelText('Название нового поля'), {
      target: { value: 'Стоимость' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить поле' }));
    fireEvent.change(screen.getByLabelText('Стоимость'), { target: { value: '10 энергии' } });
    expect(design().title).toBe('Быстрый рывок');
    expect(design().fields.Стоимость).toBe('10 энергии');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить строку' }));
    fireEvent.change(screen.getByLabelText('Строка 1, колонка 1'), { target: { value: '10' } });
    expect(design().table.rows).toEqual([['10']]);
    fireEvent.change(screen.getByLabelText('Автор комментария'), { target: { value: 'Анна' } });
    fireEvent.change(screen.getByLabelText('Новый комментарий'), {
      target: { value: 'Проверить на геймпаде' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить комментарий' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отметить решённым' }));
    expect(design().comments[0]).toMatchObject({
      author: 'Анна',
      text: 'Проверить на геймпаде',
      resolved: true,
    });
  });

  it('finds content, focuses the result, and inserts the chosen card type', () => {
    render(<DesignSidebar />);
    fireEvent.change(screen.getByLabelText('Поиск по диздоку'), {
      target: { value: 'Выносливость' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Открыть: Выносливость' }));
    expect(useBoardStore.getState().selection).toEqual(['b']);
    fireEvent.change(screen.getByLabelText('Тип новой карточки'), {
      target: { value: 'playtest' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить карточку' }));
    const id = useBoardStore.getState().selection[0];
    expect(id).toBeTruthy();
    expect(design(id)).toMatchObject({ cardType: 'playtest' });
  });

  it('edits originals through references and displays a missing target honestly', () => {
    const ref = { ...card('r', ''), design: { kind: 'reference' as const, targetId: 'a' } };
    useBoardStore.setState((s) => {
      if (s.document) {
        s.document.nodes.r = ref;
        s.document.order.push('r');
      }
    });
    const { rerender } = render(<DesignInspector node={ref} />);
    fireEvent.change(screen.getByLabelText('Название карточки'), {
      target: { value: 'Обновлённый рывок' },
    });
    expect(design().title).toBe('Обновлённый рывок');
    rerender(
      <DesignInspector node={{ ...ref, design: { kind: 'reference', targetId: 'missing' } }} />,
    );
    expect(screen.getByText('Удалённая карточка')).toBeTruthy();
  });

  it('saves a version and restores it only after confirmation with an automatic backup', () => {
    render(<DesignTools name="Игра" />);
    fireEvent.click(screen.getByRole('button', { name: 'Версии' }));
    fireEvent.change(screen.getByLabelText('Название версии'), {
      target: { value: 'До плейтеста' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить версию' }));
    expect(useBoardStore.getState().document?.versions).toHaveLength(1);
    act(() =>
      useBoardStore.setState((s) => {
        const n = s.document?.nodes.a;
        if (n?.type === 'shape' && n.design?.kind === 'card') n.design.title = 'После';
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Восстановить До плейтеста' }));
    expect(design().title).toBe('После');
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить восстановление' }));
    expect(design().title).toBe('Рывок');
    expect(useBoardStore.getState().document?.versions).toHaveLength(2);
  });

  it('reads current card content without exposing editing controls', () => {
    render(<DesignTools name="Игра" />);
    fireEvent.click(screen.getByRole('button', { name: 'Читать диздок' }));
    expect(screen.getByRole('heading', { name: 'Рывок' })).toBeTruthy();
    expect(screen.queryByLabelText('Название карточки')).toBeNull();
    expect(screen.getByRole('button', { name: 'Скачать Markdown' })).toBeTruthy();
  });
  it('keeps grouped cards inside their section in reading mode and renders each once', () => {
    useBoardStore.setState((s) => {
      if (!s.document) return;
      s.document.nodes.g = {
        id: 'g',
        type: 'group',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        rotation: 0,
        opacity: 1,
        locked: false,
        children: ['a'],
      };
      s.document.nodes.section = {
        ...card('section', ''),
        design: {
          kind: 'section',
          title: 'Бой',
          description: '',
          readingOrder: 0,
          collapsed: true,
          children: ['g'],
        },
      };
      s.document.order.push('g', 'section');
    });
    render(<DesignTools name="Игра" />);
    fireEvent.click(screen.getByRole('button', { name: 'Читать диздок' }));
    const section = screen.getByRole('heading', { name: 'Бой' }).closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByRole('heading', { name: 'Рывок' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Рывок' })).toHaveLength(1);
  });

  it('returns keyboard focus to the reading button after closing', async () => {
    render(<DesignTools name="Игра" />);
    const opener = screen.getByRole('button', { name: 'Читать диздок' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe('version confirmation accessibility', () => {
  it('keeps a cancelled version and returns focus to its restore button', async () => {
    const snapshot = fixture();
    useBoardStore.setState((s) => {
      if (s.document)
        s.document.versions = [
          {
            id: 'version',
            name: 'Снимок',
            createdAt: Date.now(),
            snapshot: {
              nodes: snapshot.nodes,
              order: snapshot.order,
              background: snapshot.background,
            },
          },
        ];
    });
    render(<DesignTools name="Игра" />);
    fireEvent.click(screen.getByRole('button', { name: 'Версии' }));
    const restore = screen.getByRole('button', { name: 'Восстановить Снимок' });
    restore.focus();
    fireEvent.click(restore);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(useBoardStore.getState().document?.versions).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(restore));
  });
});

const ToolsWithShortcuts = () => {
  useShortcuts();
  return <DesignTools name="Игра" />;
};
it('contains dialog keyboard events so Delete and Escape cannot change the canvas', () => {
  useBoardStore.setState({ selection: ['a'] });
  render(<ToolsWithShortcuts />);
  fireEvent.click(screen.getByRole('button', { name: 'Версии' }));
  const close = screen.getByRole('button', { name: 'Закрыть' });
  close.focus();
  fireEvent.keyDown(close, { key: 'Delete', code: 'Delete' });
  expect(design().title).toBe('Рывок');
  fireEvent.keyDown(close, { key: 'Escape', code: 'Escape' });
  expect(useBoardStore.getState().selection).toEqual(['a']);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('does not render content panels on camera movement but updates when card content changes', () => {
  let renders = 0;
  const node = useBoardStore.getState().document?.nodes.a as ShapeNode;
  render(
    <Profiler
      id="design-panels"
      onRender={() => {
        renders++;
      }}
    >
      <DesignSidebar />
      <DesignInspector node={node} />
      <DesignTools name="Игра" />
    </Profiler>,
  );
  const initial = renders;
  act(() => useBoardStore.getState().setViewport({ x: 120, y: 80, zoom: 0.7 }));
  expect(renders).toBe(initial);
  act(() =>
    useBoardStore.setState((s) => {
      const card = s.document?.nodes.a;
      if (card?.type === 'shape' && card.design?.kind === 'card') card.design.title = 'Новый рывок';
    }),
  );
  expect((screen.getByLabelText('Название карточки') as HTMLInputElement).value).toBe(
    'Новый рывок',
  );
  expect(renders).toBeGreaterThan(initial);
});
