/**
 * Форма строки, которая уезжает на сервер. Проверяется то, что молча разъедется:
 * время в Postgres — строка ISO, а сравниваем мы миллисекунды, и обратный разбор
 * обязан давать ровно то же число.
 */

import { describe, expect, it } from 'vitest';

import { doc, shape } from '@/shared/model/fixtures';
import { rowUpdatedAt, toRow } from './push';

const project = {
  id: 'p1',
  name: 'Доска',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_500_000,
};

describe('toRow', () => {
  it('кладёт документ целиком и владельца', () => {
    const row = toRow(project, doc([shape('a')]), 'user-1', false);

    expect(row.id).toBe('p1');
    expect(row.owner).toBe('user-1');
    expect(row.is_public).toBe(false);
    expect(Object.keys(row.document.nodes)).toEqual(['a']);
  });

  it('время уходит строкой ISO и разбирается обратно без потерь', () => {
    const row = toRow(project, doc([]), 'user-1', false);

    expect(row.updated_at).toBe(new Date(1_700_000_500_000).toISOString());
    expect(rowUpdatedAt(row.updated_at)).toBe(1_700_000_500_000);
  });

  it('превью может не быть — это null, а не undefined', () => {
    // undefined в jsonb превращается в отсутствие поля, и строка на сервере
    // начинает отличаться от строки локально.
    expect(toRow(project, doc([]), 'user-1', false).thumbnail).toBeNull();
  });
});
