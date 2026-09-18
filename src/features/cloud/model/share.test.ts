/**
 * Адрес публичной доски. Проверяется на подставленном origin: тест не должен
 * зависеть от того, на каком домене его запустили.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { doc } from '@/shared/model/fixtures';
import { setCloud } from './client';
import { loadPublicBoard, publicPath, publicUrl, setPublic } from './share';

const states = vi.hoisted(() => ({
  readSyncState: vi.fn(async (): Promise<unknown> => undefined),
  writeSyncState: vi.fn(async () => undefined),
}));
vi.mock('@/features/persistence/syncStore', () => states);

const select = vi.fn();
/** Что вернёт `update(...).eq(...).select(...)` — столько строк и затронуто. */
const updated = vi.fn(async (): Promise<unknown> => ({ data: [{ id: 'p1' }], error: null }));

const row = {
  id: 'p1',
  owner: 'user-1',
  name: 'Общая доска',
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  thumbnail: 'data:image/png;base64,превью',
  document: doc([]),
  is_public: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  select.mockImplementation(() => ({
    eq: () => ({ single: async () => ({ data: row, error: null }) }),
  }));
  updated.mockResolvedValue({ data: [{ id: 'p1' }], error: null });

  setCloud({
    from: () => ({
      select,
      update: () => ({ eq: () => ({ select: updated }) }),
    }),
  } as never);
});

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

describe('loadPublicBoard', () => {
  it('запрашивает только имя и документ, а не всю строку', async () => {
    // `select('*')` отдаёт анониму владельца доски — а по владельцу
    // открывается его папка в хранилище картинок.
    await loadPublicBoard('p1');

    const columns = select.mock.calls[0]?.[0] as string;
    expect(columns).not.toContain('*');
    expect(columns).toContain('name');
    expect(columns).toContain('document');
    expect(columns).not.toContain('owner');
  });

  it('наружу уходят только имя и документ', async () => {
    expect(Object.keys((await loadPublicBoard('p1')) ?? {}).sort()).toEqual(['document', 'name']);
  });
});

describe('setPublic', () => {
  it('строка изменилась — успех', async () => {
    expect(await setPublic('p1', true)).toBe(true);
  });

  it('не изменилось ни одной строки — это отказ, а не успех', async () => {
    // Правило доступа отсеяло чужую доску: ошибки нет, но и флаг не изменён.
    updated.mockResolvedValue({ data: [], error: null });

    expect(await setPublic('p1', true)).toBe(false);
    expect(states.writeSyncState).not.toHaveBeenCalled();
  });
});
