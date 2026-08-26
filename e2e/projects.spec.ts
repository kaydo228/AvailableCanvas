import { expect, test } from '@playwright/test';

/**
 * Экран проектов, FR-01.
 *
 * Главное, ради чего этот файл существует: после создания проекта пользователь
 * обязан оказаться на холсте, а не вернуться в список. Это требование легко
 * потерять при рефакторинге диалога, и вручную его каждый раз никто не проверит.
 */

test.beforeEach(async ({ page }) => {
  // Хранилище живёт в браузере, между тестами его надо обнулять,
  // иначе «пустое состояние» проверяется на непустой базе.
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('пустое состояние: заголовок, пояснение и кнопка вместо пустой сетки', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Чистый лист без края' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать проект' })).toHaveCount(2); // шапка и центр
});

test('после создания пользователь попадает сразу на холст, а не в список', async ({ page }) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();

  const name = page.getByLabel('Имя проекта');
  await expect(name).toBeFocused();
  await name.fill('Схема авторизации');
  await page.getByRole('button', { name: 'Создать' }).click();

  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.getByText('Схема авторизации')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('Enter в поле имени подтверждает создание', async ({ page }) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Через Enter');
  await page.getByLabel('Имя проекта').press('Enter');

  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
});

test('перезагрузка на холсте открывает тот же проект', async ({ page }) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('После перезагрузки');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  const url = page.url();
  await page.reload();

  await expect(page).toHaveURL(url);
  await expect(page.getByText('После перезагрузки')).toBeVisible();
});

test('удаление требует подтверждения и убирает карточку', async ({ page }) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('На удаление');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  await page.goto('/');
  const card = page.getByText('На удаление');
  await expect(card).toBeVisible();

  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Удалить' }).click();

  // Подтверждение обязательно: пока не нажата кнопка в диалоге, проект на месте.
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByText('На удаление')).toBeVisible();

  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  await page.getByRole('button', { name: 'Удалить' }).last().click();

  await expect(page.getByText('На удаление')).toHaveCount(0);
});
