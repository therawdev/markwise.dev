// Permission catalog. Custom roles pick any subset of these.
export const PERMISSIONS = [
  { key: 'doc:view', label: 'View documents' },
  { key: 'doc:create', label: 'Create documents' },
  { key: 'doc:edit', label: 'Edit documents' },
  { key: 'doc:comment', label: 'Comment on documents' },
  { key: 'doc:delete', label: 'Delete documents' },
  { key: 'doc:export', label: 'Export documents (PDF/Word/Markdown)' },
  { key: 'doc:share', label: 'Share documents' },
  { key: 'project:manage', label: 'Create and manage projects' },
  { key: 'ai:generate', label: 'Generate visuals with AI' },
  { key: 'org:manage_members', label: 'Invite and remove members' },
  { key: 'org:manage_roles', label: 'Create and edit roles' },
  { key: 'org:settings', label: 'Change company settings' },
  { key: 'org:billing', label: 'Manage billing' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

// Default roles seeded for every company. `is_system` roles cannot be deleted.
export const DEFAULT_ROLES: { name: string; permissions: PermissionKey[] }[] = [
  { name: 'Owner', permissions: [...ALL_PERMISSIONS] },
  {
    name: 'User',
    permissions: ['doc:view', 'doc:create', 'doc:edit', 'doc:comment', 'doc:export', 'doc:share', 'project:manage', 'ai:generate'],
  },
];

export function isValidPermissionList(perms: unknown): perms is PermissionKey[] {
  return Array.isArray(perms) && perms.every((p) => (ALL_PERMISSIONS as string[]).includes(p));
}
