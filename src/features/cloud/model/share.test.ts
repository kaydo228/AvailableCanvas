/**
 * Адрес публичной доски. Проверяется на подставленном origin: тест не должен
 * зависеть от того, на каком домене его запустили.
 */

import { describe, expect, it } from 'vitest';

import { publicPath, publicUrl } from './share';

describe('публичная ссылка', () => {
  it('путь строится от id доски', () => {
    expect(publicPath('p1')).toBe('/s/p1');
  });

  it('полный адрес берёт origin страницы', () => {
    expect(publicUrl('p1', 'https://prostor.example')).toBe('https://prostor.example/s/p1');
  });

  it('лишний слэш на конце origin не даёт двойного', () => {
    expect(publicUrl('p1', 'https://prostor.example/')).toBe('https://prostor.example/s/p1');
  });
});
