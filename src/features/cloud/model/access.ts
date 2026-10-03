export type ProjectAccess = 'owner' | 'editor' | 'viewer';
export type MemberRole = Exclude<ProjectAccess, 'owner'>;

export const canEdit = (access?: ProjectAccess): boolean =>
  access === 'owner' || access === 'editor';

export const canManageAccess = (access?: ProjectAccess): boolean => access === 'owner';
