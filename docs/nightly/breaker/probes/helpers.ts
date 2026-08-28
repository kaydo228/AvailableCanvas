import { expect, type Page } from '@playwright/test';

export const shape = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
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
  fill: '#ffd6a5',
  stroke: '#111111',
  strokeWidth: 2,
  ...extra,
});

/** Пустой проект с открытым холстом и доступным window.__board. */
export const openBoard = async (page: Page, name = 'Проба'): Promise<void> => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForFunction(() => window.__board.getState().document !== null);
};

/** Документ доски целиком. */
export const doc = (page: Page) => page.evaluate(() => window.__board.getState().document);

/** Нарушения инвариантов текущего документа — валидатор зовётся в самом приложении. */
export const violations = (page: Page) =>
  page.evaluate(async () => {
    const document = window.__board.getState().document;
    if (!document) return [{ rule: 0, message: 'документа нет' }];
    const mod = await import('/src/shared/model/invariants.ts');
    return mod.validateDocument(document);
  });

/** Ошибки страницы и консоли, накопленные за сценарий. */
export const watchErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
};
