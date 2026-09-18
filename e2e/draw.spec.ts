import { expect, test } from '@playwright/test';

test('инструмент «Стрелка» сохраняет свободную траекторию на доске', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Стрелка');
  await page.getByRole('button', { name: 'Создать' }).click();

  await page.getByTitle('Стрелка (P)').click();
  const box = await page.getByRole('application', { name: 'Холст доски' }).boundingBox();
  if (!box) throw new Error('холст не измерился');

  await page.mouse.move(box.x + 120, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 120);
  await page.mouse.move(box.x + 240, box.y + 180);
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate(() =>
        Object.values(window.__board.getState().document?.nodes ?? {}).some(
          (node) => node.type === 'draw' && node.points.length >= 6,
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByTitle('Выбор (V)')).toHaveAttribute('aria-pressed', 'true');
});
