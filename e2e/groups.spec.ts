import { expect, test } from '@playwright/test';

/**
 * Группы на холсте (раздел 5 ТЗ, `GroupNode`).
 *
 * Юнит-тесты покрывают состав и перемещение. Здесь то, чего они не видят:
 * что клавиши вообще доходят до стора и что рамка группы не перехватывает
 * мышь — иначе группа с широко расставленным содержимым превращается
 * в невидимую заслонку на полдоски.
 */

const shape = (id: string, x: number, y: number, fill: string) => ({
  id,
  type: 'shape',
  shape: 'rect',
  x,
  y,
  width: 120,
  height: 80,
  rotation: 0,
  opacity: 1,
  locked: false,
  fill,
  stroke: '#111111',
  strokeWidth: 2,
});

const setup = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Группы');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForFunction(() => window.__board.getState().document !== null);

  await page.evaluate(
    (nodes) => {
      const board = window.__board.getState();
      for (const node of nodes) board.addNode(node as never);
      board.select(['a', 'b']);
    },
    [
      shape('a', 120, 140, '#ffd6a5'),
      shape('b', 340, 230, '#a5d8ff'),
      shape('c', 640, 140, '#c3f0ca'),
    ],
  );
};

/** Группа в документе, если она там одна. */
const theGroup = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const document = window.__board.getState().document;
    const group = Object.values(document?.nodes ?? {}).find((node) => node.type === 'group');
    return group
      ? {
          id: group.id,
          children: group.children,
          box: [group.x, group.y, group.width, group.height],
        }
      : null;
  });

test('Cmd+G собирает группу, Cmd+Shift+G распускает', async ({ page }) => {
  await setup(page);

  await page.keyboard.press('ControlOrMeta+KeyG');
  const group = await theGroup(page);
  expect(group?.children).toEqual(['a', 'b']);
  // a: 120..240 × 140..220, b: 340..460 × 230..310.
  expect(group?.box).toEqual([120, 140, 340, 170]);

  await expect(page.getByText('Выделено: 3')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Shift+KeyG');
  expect(await theGroup(page)).toBeNull();

  // Узлы остались на месте и без groupId.
  const after = await page.evaluate(() => {
    const nodes = window.__board.getState().document?.nodes ?? {};
    const a = nodes.a as { x: number; y: number; groupId?: string };
    return { x: a.x, y: a.y, groupId: a.groupId ?? null };
  });
  expect(after).toEqual({ x: 120, y: 140, groupId: null });
});

test('рамка группы не ловит мышь: клик по пустоте внутри неё ни во что не попадает', async ({
  page,
}) => {
  await setup(page);
  await page.keyboard.press('ControlOrMeta+KeyG');
  await page.evaluate(() => window.__board.getState().clearSelection());

  // Точка внутри рамки группы (120..460 × 140..310), но мимо обеих фигур:
  // a кончается на x=240, b начинается на x=340 и на y=230.
  await page
    .locator('canvas')
    .last()
    .click({ position: { x: 300, y: 160 } });

  // Будь у рамки хит-тест, она перехватила бы клик и выделила группу —
  // и заодно перекрывала бы всё, что окажется под ней на доске.
  expect(await page.evaluate(() => window.__board.getState().selection)).toEqual([]);
});

test('сдвиг стрелками двигает содержимое, а не одну рамку', async ({ page }) => {
  await setup(page);
  await page.keyboard.press('ControlOrMeta+KeyG');

  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');

  const state = await page.evaluate(() => {
    const nodes = window.__board.getState().document?.nodes ?? {};
    const group = Object.values(nodes).find((node) => node.type === 'group');
    return {
      a: (nodes.a as { x: number }).x,
      b: (nodes.b as { x: number }).x,
      group: group && group.type === 'group' ? { x: group.x, width: group.width } : null,
    };
  });

  // Шаг 10 с Shift, три нажатия — плюс тридцать, и ровно один раз.
  expect(state).toEqual({ a: 150, b: 370, group: { x: 150, width: 340 } });
});

test('Delete по группе уносит содержимое', async ({ page }) => {
  await setup(page);
  await page.keyboard.press('ControlOrMeta+KeyG');
  await page.keyboard.press('Delete');

  const left = await page.evaluate(() => {
    const document = window.__board.getState().document;
    return { nodes: Object.keys(document?.nodes ?? {}), order: document?.order ?? [] };
  });
  expect(left).toEqual({ nodes: ['c'], order: ['c'] });
});
