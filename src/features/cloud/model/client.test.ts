/**
 * Создание клиента из переменных окружения.
 *
 * Проверяется главное свойство: без переменных облака нет, и приложение
 * обязано работать локально, а не падать на старте.
 */

import { describe, expect, it } from 'vitest';

import { createCloudClient } from './client';

describe('createCloudClient', () => {
  it('без переменных окружения клиента нет', () => {
    expect(createCloudClient({})).toBeNull();
  });

  it('половины настроек мало', () => {
    expect(createCloudClient({ url: 'https://x.supabase.co' })).toBeNull();
    expect(createCloudClient({ anonKey: 'ключ' })).toBeNull();
  });

  it('пустые строки — это тоже «не настроено»', () => {
    expect(createCloudClient({ url: '', anonKey: '' })).toBeNull();
  });

  it('с обеими настройками клиент создаётся', () => {
    const client = createCloudClient({ url: 'https://x.supabase.co', anonKey: 'ключ' });
    expect(client).not.toBeNull();
  });
});
