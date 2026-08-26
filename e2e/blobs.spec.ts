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
