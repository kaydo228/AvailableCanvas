import { expect, test } from '@playwright/test';

/**
 * Хранилище картинок (FR-06). Проверяется в настоящем браузере: jsdom не умеет
 * IndexedDB и не декодирует изображения, юнит-тестом это не покрыть без
 * лишней зависимости.
 */

test('картинка кладётся, читается и отдаёт натуральный размер', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { putImage, getImageElement, getBlob, deleteBlob } = await import(
      '/src/features/persistence/blobStore.ts'
    );

    // 2×1 PNG, собранный на месте — без внешних файлов.
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2d-контекст недоступен');
    context.fillRect(0, 0, 2, 1);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('toBlob вернул null'))),
        'image/png',
      );
    });

    const stored = await putImage(blob);
    const element = await getImageElement(stored.blobId);
    const readBack = await getBlob(stored.blobId);
    const sameElement = (await getImageElement(stored.blobId)) === element;

    await deleteBlob(stored.blobId);
    const afterDelete = await getBlob(stored.blobId);

    return {
      width: stored.naturalWidth,
      height: stored.naturalHeight,
      elementLoaded: element?.complete && element.naturalWidth === 2,
      readBackType: readBack?.type,
      sameElement,
      goneAfterDelete: afterDelete === undefined,
    };
  });

  expect(result).toEqual({
    width: 2,
    height: 1,
    elementLoaded: true,
    readBackType: 'image/png',
    sameElement: true,
    goneAfterDelete: true,
  });
});

test('чужой формат и перевес отбиваются с внятной причиной', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { putImage, MAX_IMAGE_BYTES } = await import('/src/features/persistence/blobStore.ts');

    const grab = async (blob: Blob) => {
      try {
        await putImage(blob);
        return 'ПРОШЛО';
      } catch (error) {
        return (error as { reason?: string }).reason ?? 'другая ошибка';
      }
    };

    return {
      pdf: await grab(new Blob(['x'], { type: 'application/pdf' })),
      huge: await grab(new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/png' })),
    };
  });

  expect(result).toEqual({ pdf: 'type', huge: 'size' });
});

test('удаление проекта уносит его картинки, но не те, что держит копия', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { putImage, getBlob } = await import('/src/features/persistence/blobStore.ts');
    const { createProject, deleteProject, duplicateProject, saveDocument, getDocument } =
      await import('/src/features/persistence/projectsRepo.ts');

    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext('2d')?.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('toBlob вернул null'))),
        'image/png',
      );
    });

    const stored = await putImage(blob);
    const project = await createProject('С картинкой');
    const board = await getDocument(project.id);
    if (!board) throw new Error('документ не создался');

    board.nodes.img = {
      id: 'img',
      type: 'image',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      rotation: 0,
      opacity: 1,
      locked: false,
      blobId: stored.blobId,
      naturalWidth: stored.naturalWidth,
      naturalHeight: stored.naturalHeight,
    };
    board.order.push('img');
    await saveDocument(board);

    // Копия держится за ТОТ ЖЕ блоб — удаление оригинала не должно его трогать.
    const copy = await duplicateProject(project.id);
    if (!copy) throw new Error('копия не создалась');

    await deleteProject(project.id);
    const afterFirst = await getBlob(stored.blobId);

    await deleteProject(copy.id);
    const afterSecond = await getBlob(stored.blobId);

    return { keptForCopy: afterFirst !== undefined, goneWithLast: afterSecond === undefined };
  });

  expect(result).toEqual({ keptForCopy: true, goneWithLast: true });
});
