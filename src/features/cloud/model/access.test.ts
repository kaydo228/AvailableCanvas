import { describe, expect, it } from 'vitest';

import { canEdit, canManageAccess } from './access';

describe('project access', () => {
  it('owner and editor may edit, viewer may not', () => {
    expect(canEdit('owner')).toBe(true);
    expect(canEdit('editor')).toBe(true);
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit(undefined)).toBe(false);
  });

  it('only owner may manage access', () => {
    expect(canManageAccess('owner')).toBe(true);
    expect(canManageAccess('editor')).toBe(false);
    expect(canManageAccess('viewer')).toBe(false);
    expect(canManageAccess(undefined)).toBe(false);
  });
});
