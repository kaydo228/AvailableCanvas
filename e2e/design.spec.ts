import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 1000 } });

async function openProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Игровой диздок');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
}

test('карточка → раздел → сворачивание → поиск → сохранение → чтение', async ({ page }) => {
  await openProject(page);
  await page.getByLabel('Тип новой карточки').selectOption('mechanic');
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await page.getByLabel('Название карточки').fill('Рывок');
  await page.getByLabel('Краткое описание').fill('Быстрое сближение за выносливость');
  await page.getByLabel('Проверка идеи').selectOption('testing');
  const cardId = await page.evaluate(() => window.__board.getState().selection[0]);
  await page.getByRole('button', { name: 'Раздел из выделенного' }).click();
  await page.getByLabel('Название раздела').fill('Боевая система');
  await page.getByRole('button', { name: 'Свернуть раздел Боевая система', exact: true }).click();
  await page.getByLabel('Поиск по диздоку').fill('выносливость');
  await page.getByRole('button', { name: 'Открыть: Рывок', exact: true }).click();
  await expect(page.getByLabel('Название карточки')).toHaveValue('Рывок');
  expect(
    await page.evaluate(() => {
      const sections = Object.values(window.__board.getState().document?.nodes ?? {}).filter(
        (n) => n.type === 'shape' && n.design?.kind === 'section',
      );
      return sections.every(
        (n) => n.type === 'shape' && n.design?.kind === 'section' && !n.design.collapsed,
      );
    }),
  ).toBe(true);
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
  await page.goto(`${page.url().split('?')[0]}?node=${cardId}`);
  await expect(page.getByLabel('Название карточки')).toHaveValue('Рывок');
  await expect(page.getByLabel('Краткое описание')).toHaveValue(
    'Быстрое сближение за выносливость',
  );
  await page.getByRole('button', { name: 'Читать диздок', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Рывок', { exact: true }).first()).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Markdown/ }).click();
  const file = await downloaded;
  const path = await file.path();
  if (!path) throw new Error('Markdown не скачался');
  const markdown = await readFile(path, 'utf8');
  expect(markdown).toContain('Боевая система');
  expect(markdown).toContain('Быстрое сближение за выносливость');
});

test('именованная версия восстанавливает карточку и сохраняет страховочную копию', async ({
  page,
}) => {
  await openProject(page);
  await page.getByRole('button', { name: 'Добавить карточку', exact: true }).click();
  await page.getByLabel('Название карточки').fill('До плейтеста');
  const cardId = await page.evaluate(() => window.__board.getState().selection[0]);
  await page.getByRole('button', { name: 'Версии', exact: true }).click();
  await page.getByLabel('Название версии').fill('Прототип 1');
  await page.getByRole('button', { name: 'Сохранить версию', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Название карточки').fill('После плейтеста');
  await page.getByRole('button', { name: 'Версии', exact: true }).click();
  await page.getByRole('button', { name: 'Восстановить Прототип 1', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить восстановление', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const node = window.__board.getState().document?.nodes[id ?? ''];
        return node?.type === 'shape' && node.design?.kind === 'card' ? node.design.title : '';
      }, cardId),
    )
    .toBe('До плейтеста');
  expect(await page.evaluate(() => window.__board.getState().document?.versions?.length)).toBe(2);
});
