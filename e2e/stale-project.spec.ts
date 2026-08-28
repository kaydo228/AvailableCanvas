import { expect, test } from '@playwright/test';

/**
 * Диалоги над проектом, которого уже нет, и лимит имени (П8, П9, П11
 * из docs/nightly/shell/01-план-починки.md).
 *
 * Раньше «Переименовать» над удалённым проектом молча закрывался, будто всё
 * получилось; диалог дублирования писал «Копия проекта «»» одинаково и во
 * время загрузки, и над пустотой; а « — копия» дописывалась мимо maxLength,
 * и имя росло без предела.
 */

const create = async (page: import('@playwright/test').Page, name: string) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  const id = page.url().split('/p/')[1] as string;
  await page.goto('/');
  return id;
};

const removeBehindTheBack = (page: import('@playwright/test').Page, projectId: string) =>
  page.evaluate(async (id) => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    await repo.deleteProject(id);
  }, projectId);

const names = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    return (await repo.listProjects()).map((project) => project.name);
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('переименование исчезнувшего проекта — отказ, а не молчаливый успех', async ({ page }) => {
  const id = await create(page, 'Призрак');
  await expect(page.locator('button.group')).toHaveCount(1);

  await removeBehindTheBack(page, id);

  await page.locator('button.group').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  await page.getByLabel('Имя проекта').fill('Новое имя');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.locator('[data-sonner-toast]')).toContainText(/Проект уже удалён/);
  // Диалог остаётся открытым: закрыть его значит соврать про успех.
  await expect(page.getByLabel('Имя проекта')).toBeVisible();
});

test('дублирование исчезнувшего проекта — отказ', async ({ page }) => {
  const id = await create(page, 'Исходник');
  await expect(page.locator('button.group')).toHaveCount(1);

  await removeBehindTheBack(page, id);

  await page.locator('button.group').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Дублировать' }).click();
  await page.getByRole('button', { name: 'Дублировать' }).last().click();

  await expect(page.locator('[data-sonner-toast]')).toContainText(/Проект уже удалён/);
  expect(await names(page)).toEqual([]);
});

test('« — копия» не пробивает предел длины имени', async ({ page }) => {
  await create(page, 'Ы'.repeat(115));

  for (let i = 0; i < 4; i++) {
    await page.locator('button.group').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Дублировать' }).click();
    await page.getByRole('button', { name: 'Дублировать' }).last().click();
    await expect(page.locator('button.group')).toHaveCount(i + 2);
  }

  const longest = Math.max(...(await names(page)).map((name) => name.length));
  expect(longest).toBeLessThanOrEqual(120);
});

test('повторное открытие того же проекта не двигает updatedAt', async ({ page }) => {
  await create(page, 'Только смотрю');

  const stamp = async () => {
    const list = await page.evaluate(async () => {
      const repo = await import('/src/features/persistence/projectsRepo.ts');
      return (await repo.listProjects()).map((project) => project.updatedAt);
    });
    return list[0];
  };

  const before = await stamp();

  // Заходим и выходим внутри приложения, без перезагрузки страницы: именно
  // на этом пути документ раньше оставался в сторе и переписывался заново.
  for (let i = 0; i < 2; i++) {
    await page.locator('button.group').first().click();
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Назад к списку' }).click();
    await expect(page.locator('button.group')).toHaveCount(1);
  }

  expect(await stamp()).toBe(before);
});
