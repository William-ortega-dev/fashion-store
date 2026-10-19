export const DEFAULT_TENANT_ID = 'tenant-atelier-n8';
export const DEFAULT_TENANT_SLUG = 'atelier-n8';

export const PERMISSIONS = [
  'catalog.read', 'catalog.manage', 'inventory.manage', 'orders.read', 'orders.manage',
  'branding.manage', 'team.manage', 'roles.manage',
];

export const BUILT_IN_ROLES = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => permission !== 'roles.manage'),
  seller: ['catalog.read', 'orders.read', 'orders.manage'],
  inventory_manager: ['catalog.read', 'catalog.manage', 'inventory.manage'],
  order_manager: ['catalog.read', 'orders.read', 'orders.manage'],
};

export const THEMES = ['minimal', 'editorial', 'urbano', 'moderno', 'clasico'];

export const DEFAULT_BRAND = {
  template: 'minimal',
  brandName: 'Atelier N°8',
  tagline: 'Vestir con intención. Vivir con ligereza.',
  primaryColor: '#34352e',
  accentColor: '#a58c6b',
  backgroundColor: '#f8f7f2',
  textColor: '#292923',
  headingFont: 'Cormorant Garamond',
  bodyFont: 'DM Sans',
  heroImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2200&q=90',
  heroTitle: 'Menos piezas. Más vida.',
  heroSubtitle: 'Prendas que se sienten bien hoy, y siguen teniendo sentido mañana.',
  logoUrl: '',
  contactEmail: 'hola@ateliern8.co',
};

export const DEFAULT_PLANS = [
  { id: 'basic', name: 'Esencial', maxProducts: 25, maxMembers: 2, allowedTemplates: ['minimal', 'editorial'], customFonts: false },
  { id: 'pro', name: 'Estudio', maxProducts: 500, maxMembers: 10, allowedTemplates: THEMES, customFonts: true },
  { id: 'enterprise', name: 'Atelier', maxProducts: 10000, maxMembers: 50, allowedTemplates: THEMES, customFonts: true },
];

export function rolePermissions(role, customPermissions = []) {
  return BUILT_IN_ROLES[role] || customPermissions;
}
