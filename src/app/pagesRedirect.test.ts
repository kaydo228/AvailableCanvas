import { describe, expect, it } from 'vitest';

import { restorePagesRoute } from './pagesRedirect';

describe('restorePagesRoute', () => {
  it('restores a route below the current GitHub Pages base', () => {
    expect(
      restorePagesRoute(
        'https://kaydo228.github.io/AvailableCanvas/?redirect=%2Finvite%3Ftoken%3Dx',
      ),
    ).toBe('/AvailableCanvas/invite?token=x');
  });

  it('rejects an external URL', () => {
    expect(
      restorePagesRoute(
        'https://kaydo228.github.io/AvailableCanvas/?redirect=https%3A%2F%2Fevil.test',
      ),
    ).toBeNull();
  });

  it('rejects protocol-relative paths', () => {
    expect(
      restorePagesRoute('https://kaydo228.github.io/AvailableCanvas/?redirect=%2F%2Fevil.test'),
    ).toBeNull();
  });

  it('returns null when there is no redirect', () => {
    expect(restorePagesRoute('https://kaydo228.github.io/AvailableCanvas/')).toBeNull();
  });
});
