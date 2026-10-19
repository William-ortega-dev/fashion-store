import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { mapProduct } from './product-model.js';
import { BUILT_IN_ROLES, DEFAULT_BRAND, PERMISSIONS, THEMES, rolePermissions } from './tenant-model.js';
import { createAssetId, deleteAsset, inspectImage, readAsset, saveAsset } from './asset-storage.js';

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(128);
const fontSchema = z.enum(['Cormorant Garamond', 'DM Sans', 'Playfair Display', 'Lora', 'Merriweather', 'Montserrat', 'Arial', 'Georgia']);
const productSchema = z.object({
  name: z.string().trim().min(2).max(100),
  subtitle: z.string().trim().max(120).default(''),
  categoryId: z.string().min(1),
  description: z.string().trim().min(10).max(2000),
  price: z.coerce.number().int().nonnegative().max(100000000),
  image: z.string().url().max(1000),
  sizes: z.array(z.string().trim().min(1).max(12)).min(1).max(20),
  colors: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  stock: z.coerce.number().int().nonnegative().max(100000),
  featured: z.boolean().default(false),
});
const categorySchema = z.object({
  name: z.string().trim().min(2).max(50),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
const checkoutSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(20), size: z.string().min(1), color: z.string().min(1) })).min(1).max(50),
  shipping: z.object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    address: z.string().trim().min(5).max(160),
    city: z.string().trim().min(2).max(80),
  }),
});
const storeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ownerName: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: z.string().min(12).max(128),
});
const storefrontSchema = z.object({
  template: z.enum(THEMES),
  brandName: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  headingFont: fontSchema,
  bodyFont: fontSchema,
  heroImage: z.string().max(1000).refine((value) => value.startsWith('/api/assets/') || z.string().url().safeParse(value).success),
  heroTitle: z.string().trim().min(2).max(120),
  heroSubtitle: z.string().trim().max(240),
  logoUrl: z.string().max(1000).refine((value) => value === '' || value.startsWith('/api/assets/') || z.string().url().safeParse(value).success),
  contactEmail: emailSchema,
});
const teamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: z.string().min(12).max(128).optional(),
  role: z.string().trim().min(2).max(80),
});
const roleSchema = z.object({
  name: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9 _-]+$/),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});
function validate(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join('. '));
    error.status = 400;
    throw error;
  }
  return result.data;
}

export function createApp({ db, sessionSecret = process.env.SESSION_SECRET, staticDir = path.resolve(process.cwd(), 'dist') } = {}) {
  if (!sessionSecret) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be configured in production.');
    sessionSecret = randomUUID();
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  const cookieName = 'atelier_session';
  const secureCookie = process.env.NODE_ENV === 'production';
  const signToken = (user) => jwt.sign({ sub: user.id }, sessionSecret, { expiresIn: '7d' });
  const sendSession = (res, user) => {
    res.cookie(cookieName, signToken(user), { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ user });
  };
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/plans' || req.path === '/stores') return next();
    try {
      const slug = String(req.query.store || req.headers['x-store-slug'] || 'atelier-n8').toLowerCase();
      const tenant = await db.prepare('SELECT t.id,t.name,t.slug,t.status,t.plan_id,p.name AS plan_name,p.max_products,p.max_members,p.allowed_templates,p.custom_fonts FROM tenants t JOIN plans p ON p.id=t.plan_id WHERE t.slug=? AND p.active=1').get(slug);
      if (!tenant || tenant.status !== 'active') return res.status(404).json({ error: 'No encontramos esta tienda.' });
      if (typeof tenant.allowed_templates === 'string') tenant.allowed_templates = JSON.parse(tenant.allowed_templates);
      req.tenant = tenant;
      return next();
    } catch (error) { return next(error); }
  });
  const authenticate = async (req, res, next) => {
    try {
      const token = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1);
      if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
      const claims = jwt.verify(decodeURIComponent(token), sessionSecret);
      const user = await db.prepare('SELECT id,name,email,platform_role FROM users WHERE id=?').get(claims.sub);
      if (!user) return res.status(401).json({ error: 'La sesión ya no es válida.' });
      if (user.platform_role === 'superadmin') {
        req.user = { ...user, role: 'superadmin', permissions: [] };
      } else {
        const membership = await db.prepare('SELECT m.role,m.custom_role_id,m.active,r.name AS custom_role_name,r.permissions_json FROM tenant_memberships m LEFT JOIN tenant_roles r ON r.id=m.custom_role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=? AND m.user_id=?')
          .get(req.tenant?.id || '', user.id);
        if (membership?.active) {
          let customPermissions = membership.permissions_json || [];
          if (typeof customPermissions === 'string') customPermissions = JSON.parse(customPermissions);
          const role = membership.custom_role_id ? 'custom' : membership.role;
          req.user = { ...user, role, roleName: membership.custom_role_name || membership.role, permissions: rolePermissions(role, customPermissions) };
        } else req.user = { ...user, role: 'customer', permissions: [] };
      }
      return next();
    } catch {
      return res.status(401).json({ error: 'La sesión ya no es válida.' });
    }
  };
  const requirePermission = (permission) => (req, res, next) => req.user?.permissions?.includes(permission)
    ? next()
    : res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción.' });
  const requireAnyPermission = (...permissions) => (req, res, next) => permissions.some((permission) => req.user?.permissions?.includes(permission))
    ? next()
    : res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción.' });
  const superadminOnly = (req, res, next) => req.user?.role === 'superadmin'
    ? next()
    : res.status(403).json({ error: 'Se requiere una cuenta de superadministración.' });
  const audit = (tenantId, actorId, action, targetType, targetId, details = {}) => db.prepare(
    'INSERT INTO audit_logs (id,tenant_id,actor_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?,?)',
  ).run(randomUUID(), tenantId, actorId, action, targetType, targetId, JSON.stringify(details));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/plans', async (_req, res) => {
    const plans = await db.prepare('SELECT id,name,max_products,max_members,allowed_templates,custom_fonts FROM plans WHERE active=1 ORDER BY max_products').all();
    res.json(plans.map((plan) => ({ ...plan, allowedTemplates: typeof plan.allowed_templates === 'string' ? JSON.parse(plan.allowed_templates) : plan.allowed_templates, customFonts: Boolean(plan.custom_fonts) })));
  });
  app.post('/api/stores', async (req, res, next) => {
    try {
      const data = validate(storeSchema, req.body);
      const emailInUse = await db.prepare('SELECT id FROM users WHERE email=?').get(data.email);
      if (emailInUse) return res.status(409).json({ error: 'Ese correo ya tiene una cuenta. Inicia sesión para crear otra tienda.' });
      const plan = await db.prepare("SELECT id FROM plans WHERE id='basic' AND active=1").get();
      const tenantId = randomUUID();
      const userId = randomUUID();
      const created = await db.transaction(async (tx) => {
        await tx.prepare('INSERT INTO tenants (id,name,slug,plan_id) VALUES (?,?,?,?)').run(tenantId, data.name, data.slug, plan.id);
        await tx.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)').run(userId, data.ownerName, data.email, bcrypt.hashSync(data.password, 12), 'customer');
        await tx.prepare('INSERT INTO tenant_memberships (tenant_id,user_id,role) VALUES (?,?,?)').run(tenantId, userId, 'owner');
        await tx.prepare('INSERT INTO subscriptions (id,tenant_id,plan_id,status,provider) VALUES (?,?,?, ?,NULL)').run(randomUUID(), tenantId, 'basic', 'trialing');
        await tx.prepare('INSERT INTO tenant_settings (tenant_id,draft_json,published_json,updated_by) VALUES (?,?,?,?)').run(tenantId, JSON.stringify({ ...DEFAULT_BRAND, brandName: data.name }), JSON.stringify({ ...DEFAULT_BRAND, brandName: data.name }), userId);
        await tx.prepare('INSERT INTO audit_logs (id,tenant_id,actor_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), tenantId, userId, 'tenant.created', 'tenant', tenantId, '{}');
        return { id: tenantId, name: data.name, slug: data.slug };
      })();
      const user = { id: userId, name: data.ownerName, email: data.email, role: 'owner', roleName: 'owner', permissions: BUILT_IN_ROLES.owner };
      res.cookie(cookieName, signToken(user), { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
      res.status(201).json({ tenant: created, user, url: `/tienda/${data.slug}/` });
    } catch (error) {
      if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ese nombre o dirección de tienda ya está en uso.' });
      return next(error);
    }
  });
  app.get('/api/storefront', async (req, res) => {
    const row = await db.prepare('SELECT draft_json,published_json,updated_at FROM tenant_settings WHERE tenant_id=?').get(req.tenant.id);
    let brand = row?.published_json || DEFAULT_BRAND;
    if (typeof brand === 'string') brand = JSON.parse(brand);
    res.json({ tenant: { name: req.tenant.name, slug: req.tenant.slug }, brand, updatedAt: row?.updated_at || null });
  });
  app.get('/api/categories', async (req, res) => {
    res.json(await db.prepare('SELECT id, name, slug FROM categories WHERE tenant_id=? ORDER BY name').all(req.tenant.id));
  });
  app.get('/api/products', async (req, res) => {
    const where = ['p.tenant_id = ?'];
    const params = [req.tenant.id];
    if (req.query.q) { where.push('(p.name LIKE ? OR p.subtitle LIKE ? OR p.description LIKE ?)'); const value = '%' + String(req.query.q).slice(0, 80) + '%'; params.push(value, value, value); }
    if (req.query.category) { where.push('c.slug = ?'); params.push(String(req.query.category)); }
    if (req.query.size) { where.push('p.sizes LIKE ?'); params.push('%"' + String(req.query.size).replace(/["%_]/g, '') + '"%'); }
    if (req.query.color) { where.push('p.colors LIKE ?'); params.push('%"' + String(req.query.color).replace(/["%_]/g, '') + '"%'); }
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    if (req.query.minPrice && Number.isFinite(minPrice)) { where.push('p.price >= ?'); params.push(minPrice); }
    if (req.query.maxPrice && Number.isFinite(maxPrice)) { where.push('p.price <= ?'); params.push(maxPrice); }
    if (req.query.featured === 'true') where.push('p.featured = 1');
    const sort = ({ price_asc: 'p.price ASC', price_desc: 'p.price DESC', newest: 'p.created_at DESC' })[req.query.sort] || 'p.featured DESC, p.created_at DESC';
    const rows = await db.prepare('SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id ' +
      (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + sort).all(...params);
    res.json(rows.map((row) => ({ ...mapProduct(row), categoryName: row.category_name, categorySlug: row.category_slug })));
  });
  app.get('/api/products/:slug', async (req, res) => {
    const row = await db.prepare('SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.tenant_id=? AND p.slug=?').get(req.tenant.id, req.params.slug);
    if (!row) return res.status(404).json({ error: 'No encontramos esa prenda.' });
    return res.json({ ...mapProduct(row), categoryName: row.category_name, categorySlug: row.category_slug });
  });
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const data = validate(z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema }), req.body);
      if (!req.tenant) return res.status(400).json({ error: 'Selecciona una tienda para crear tu cuenta.' });
      const user = { id: randomUUID(), name: data.name, email: data.email, role: 'customer', roleName: 'customer', permissions: [] };
      await db.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)')
        .run(user.id, user.name, user.email, bcrypt.hashSync(data.password, 10), user.role);
      sendSession(res, user);
    } catch (error) { if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ese correo ya tiene una cuenta.' }); next(error); }
  });
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const data = validate(z.object({ email: emailSchema, password: passwordSchema }), req.body);
      const record = await db.prepare('SELECT id,name,email,password_hash,platform_role FROM users WHERE email = ?').get(data.email);
      if (!record || !bcrypt.compareSync(data.password, record.password_hash)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
      const { password_hash: _hash, platform_role: platformRole, ...user } = record;
      if (platformRole === 'superadmin') {
        user.role = 'superadmin'; user.roleName = 'superadmin'; user.permissions = [];
      } else {
        const membership = await db.prepare('SELECT m.role,m.custom_role_id,m.active,r.name AS custom_role_name,r.permissions_json FROM tenant_memberships m LEFT JOIN tenant_roles r ON r.id=m.custom_role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=? AND m.user_id=?').get(req.tenant.id, user.id);
        let customPermissions = membership?.permissions_json || [];
        if (typeof customPermissions === 'string') customPermissions = JSON.parse(customPermissions);
        user.role = membership?.active ? (membership.custom_role_id ? 'custom' : membership.role) : 'customer';
        user.roleName = membership?.active ? (membership.custom_role_name || membership.role) : 'customer';
        user.permissions = membership?.active ? rolePermissions(user.role, customPermissions) : [];
      }
      sendSession(res, user);
    } catch (error) { next(error); }
  });
  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/' });
    res.status(204).end();
  });
  app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

  app.post('/api/checkout', authenticate, async (req, res, next) => {
    try {
      const { items, shipping } = validate(checkoutSchema, req.body);
      const id = randomUUID();
      const paymentId = 'DEMO-' + randomUUID().slice(0, 8).toUpperCase();
      const createOrder = db.transaction(async (tx) => {
        let total = 0;
        const resolved = [];
        for (const item of items) {
          const product = await tx.prepare('SELECT id,name,price,stock,sizes,colors FROM products WHERE tenant_id=? AND id=?').get(req.tenant.id, item.productId);
          if (!product) { const error = new Error('Una prenda del carrito ya no está disponible.'); error.status = 409; throw error; }
          if (!JSON.parse(product.sizes).includes(item.size) || !JSON.parse(product.colors).includes(item.color)) { const error = new Error('Una talla o color seleccionado ya no está disponible.'); error.status = 409; throw error; }
          if (product.stock < item.quantity) { const error = new Error('No hay existencias suficientes de ' + product.name + '.'); error.status = 409; throw error; }
          const stockUpdate = await tx.prepare('UPDATE products SET stock = stock - ? WHERE tenant_id=? AND id=? AND stock >= ?')
            .run(item.quantity, req.tenant.id, product.id, item.quantity);
          if (!stockUpdate.changes) { const error = new Error('No hay existencias suficientes de ' + product.name + '.'); error.status = 409; throw error; }
          total += product.price * item.quantity;
          resolved.push({ productId: product.id, name: product.name, price: product.price, quantity: item.quantity, size: item.size, color: item.color });
        }
        await tx.prepare('INSERT INTO orders (id,user_id,status,total,items_json,shipping_json,demo_payment_id,tenant_id) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, req.user.id, 'confirmed', total, JSON.stringify(resolved), JSON.stringify(shipping), paymentId, req.tenant.id);
        return { id, status: 'confirmed', total, items: resolved, shipping, paymentId, createdAt: new Date().toISOString() };
      });
      return res.status(201).json(await createOrder());
    } catch (error) { return next(error); }
  });
  app.get('/api/orders/:id', authenticate, async (req, res) => {
    const found = req.user.permissions?.includes('orders.read')
      ? await db.prepare('SELECT * FROM orders WHERE tenant_id=? AND id=?').get(req.tenant.id, req.params.id)
      : await db.prepare('SELECT * FROM orders WHERE tenant_id=? AND id=? AND user_id=?').get(req.tenant.id, req.params.id, req.user.id);
    if (!found) return res.status(404).json({ error: 'No encontramos ese pedido.' });
    return res.json({ id: found.id, status: found.status, total: found.total, items: JSON.parse(found.items_json), shipping: JSON.parse(found.shipping_json), paymentId: found.demo_payment_id, createdAt: found.created_at });
  });
  app.get('/api/admin/orders', authenticate, requirePermission('orders.read'), async (req, res) => {
    const rows = await db.prepare('SELECT id,user_id,status,total,items_json,shipping_json,demo_payment_id,created_at FROM orders WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200').all(req.tenant.id);
    res.json(rows.map((order) => ({ id: order.id, userId: order.user_id, status: order.status, total: order.total, items: JSON.parse(order.items_json), shipping: JSON.parse(order.shipping_json), paymentId: order.demo_payment_id, createdAt: order.created_at })));
  });
  app.patch('/api/admin/orders/:id', authenticate, requirePermission('orders.manage'), async (req, res, next) => {
    try {
      const { status } = validate(z.object({ status: z.enum(['processing', 'shipped']) }), req.body);
      const current = await db.prepare('SELECT status FROM orders WHERE tenant_id=? AND id=?').get(req.tenant.id, req.params.id);
      if (!current) return res.status(404).json({ error: 'No encontramos ese pedido.' });
      const transitions = { confirmed: ['processing'], processing: ['shipped'], shipped: [] };
      if (current.status !== status && !transitions[current.status]?.includes(status)) return res.status(409).json({ error: 'Este pedido ya no admite ese cambio de estado.' });
      await db.prepare('UPDATE orders SET status=? WHERE tenant_id=? AND id=?').run(status, req.tenant.id, req.params.id);
      await audit(req.tenant.id, req.user.id, 'orders.status.updated', 'order', req.params.id, { status });
      return res.json({ id: req.params.id, status });
    } catch (error) { return next(error); }
  });

  app.get('/api/admin/storefront', authenticate, requirePermission('branding.manage'), async (req, res) => {
    const settings = await db.prepare('SELECT draft_json,published_json,updated_at FROM tenant_settings WHERE tenant_id=?').get(req.tenant.id);
    const parse = (value) => typeof value === 'string' ? JSON.parse(value) : value;
    res.json({ draft: parse(settings.draft_json), published: parse(settings.published_json), updatedAt: settings.updated_at, plan: { id: req.tenant.plan_id, name: req.tenant.plan_name, allowedTemplates: req.tenant.allowed_templates, customFonts: Boolean(req.tenant.custom_fonts) } });
  });
  app.post('/api/admin/assets', authenticate, requirePermission('branding.manage'), express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }), async (req, res, next) => {
    let storageKey;
    try {
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Selecciona una imagen JPG, PNG o WebP.' });
      if (req.body.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'La imagen no puede superar 2 MB.' });
      if (!inspectImage(req.body, contentType)) return res.status(415).json({ error: 'El contenido no coincide con un archivo JPG, PNG o WebP válido.' });
      const id = createAssetId();
      storageKey = await saveAsset(req.tenant.id, id, contentType, req.body);
      await db.prepare('INSERT INTO store_assets (id,tenant_id,storage_key,mime_type,size_bytes) VALUES (?,?,?,?,?)').run(id, req.tenant.id, storageKey, contentType, req.body.length);
      await audit(req.tenant.id, req.user.id, 'branding.asset.uploaded', 'asset', id, { mimeType: contentType, sizeBytes: req.body.length });
      return res.status(201).json({ id, url: `/api/assets/${id}?store=${encodeURIComponent(req.tenant.slug)}`, mimeType: contentType, sizeBytes: req.body.length });
    } catch (error) {
      if (storageKey) await deleteAsset(storageKey).catch(() => {});
      return next(error);
    }
  });
  app.get('/api/assets/:id', async (req, res, next) => {
    try {
      const asset = await db.prepare('SELECT storage_key,mime_type FROM store_assets WHERE tenant_id=? AND id=?').get(req.tenant.id, req.params.id);
      if (!asset) return res.status(404).json({ error: 'No encontramos esta imagen en la tienda.' });
      const stored = await readAsset(asset.storage_key);
      if (!stored) return res.status(404).json({ error: 'El archivo de imagen no está disponible.' });
      res.set({ 'Content-Type': asset.mime_type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      return res.send(stored.body);
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/assets/:id', authenticate, requirePermission('branding.manage'), async (req, res, next) => {
    try {
      const asset = await db.prepare('SELECT storage_key FROM store_assets WHERE tenant_id=? AND id=?').get(req.tenant.id, req.params.id);
      if (!asset) return res.status(404).json({ error: 'No encontramos esta imagen.' });
      await db.prepare('DELETE FROM store_assets WHERE tenant_id=? AND id=?').run(req.tenant.id, req.params.id);
      await deleteAsset(asset.storage_key);
      return res.status(204).end();
    } catch (error) { return next(error); }
  });
  app.put('/api/admin/storefront', authenticate, requirePermission('branding.manage'), async (req, res, next) => {
    try {
      const draft = validate(storefrontSchema, req.body);
      if (!req.tenant.allowed_templates.includes(draft.template)) return res.status(403).json({ error: 'Esta plantilla no está disponible en tu plan.' });
      if (!req.tenant.custom_fonts) {
        const allowed = ['Cormorant Garamond', 'DM Sans', 'Arial', 'Georgia'];
        if (!allowed.includes(draft.headingFont) || !allowed.includes(draft.bodyFont)) return res.status(403).json({ error: 'Las fuentes personalizadas están disponibles en el plan Estudio.' });
      }
      await db.prepare('UPDATE tenant_settings SET draft_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=?').run(JSON.stringify(draft), req.user.id, req.tenant.id);
      await audit(req.tenant.id, req.user.id, 'branding.draft.updated', 'storefront', req.tenant.id);
      return res.json({ draft, message: 'Borrador guardado. La tienda pública sigue mostrando la versión publicada.' });
    } catch (error) { return next(error); }
  });
  app.post('/api/admin/storefront/publish', authenticate, requirePermission('branding.manage'), async (req, res) => {
    const settings = await db.prepare('SELECT draft_json FROM tenant_settings WHERE tenant_id=?').get(req.tenant.id);
    if (!settings) return res.status(404).json({ error: 'No encontramos la configuración de la tienda.' });
    await db.prepare('UPDATE tenant_settings SET published_json=draft_json,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=?').run(req.user.id, req.tenant.id);
    await audit(req.tenant.id, req.user.id, 'branding.published', 'storefront', req.tenant.id);
    let brand = settings.draft_json;
    if (typeof brand === 'string') brand = JSON.parse(brand);
    return res.json({ brand, message: 'Los cambios ya están publicados.' });
  });
  app.post('/api/admin/storefront/reset-draft', authenticate, requirePermission('branding.manage'), async (req, res) => {
    const base = { ...DEFAULT_BRAND, brandName: req.tenant.name };
    await db.prepare('UPDATE tenant_settings SET draft_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=?').run(JSON.stringify(base), req.user.id, req.tenant.id);
    return res.json({ draft: base });
  });

  app.get('/api/admin/team', authenticate, requirePermission('team.manage'), async (req, res) => {
    const members = await db.prepare('SELECT u.id,u.name,u.email,m.role,m.custom_role_id,r.name AS custom_role_name,m.active,m.created_at FROM tenant_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN tenant_roles r ON r.id=m.custom_role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=? ORDER BY m.created_at').all(req.tenant.id);
    res.json(members.map((member) => ({ ...member, active: Boolean(member.active), roleName: member.custom_role_name || member.role })));
  });
  app.post('/api/admin/team', authenticate, requirePermission('team.manage'), async (req, res, next) => {
    try {
      const data = validate(teamSchema, req.body);
      let customRoleId = null;
      let storedRole = data.role;
      if (!BUILT_IN_ROLES[data.role]) {
        const role = await db.prepare('SELECT id FROM tenant_roles WHERE tenant_id=? AND id=?').get(req.tenant.id, data.role);
        if (!role) return res.status(400).json({ error: 'Selecciona un rol válido para esta tienda.' });
        customRoleId = role.id; storedRole = 'custom';
      }
      if (storedRole === 'owner') return res.status(400).json({ error: 'El rol de propietario no puede asignarse desde el panel.' });
      const existingUser = await db.prepare('SELECT id FROM users WHERE email=?').get(data.email);
      if (!existingUser && !data.password) return res.status(400).json({ error: 'Define una contraseña inicial de al menos 12 caracteres.' });
      const currentCount = await db.prepare('SELECT COUNT(*) AS count FROM tenant_memberships WHERE tenant_id=? AND active=1').get(req.tenant.id);
      if (currentCount.count >= req.tenant.max_members) return res.status(409).json({ error: 'Alcanzaste el límite de integrantes de tu plan.' });
      const userId = existingUser?.id || randomUUID();
      if (!existingUser) await db.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)').run(userId, data.name, data.email, bcrypt.hashSync(data.password, 12), 'customer');
      await db.prepare('INSERT INTO tenant_memberships (tenant_id,user_id,role,custom_role_id,active) VALUES (?,?,?,?,1)')
        .run(req.tenant.id, userId, storedRole, customRoleId);
      await audit(req.tenant.id, req.user.id, 'team.member.added', 'user', userId, { role: data.role });
      return res.status(201).json({ id: userId, email: data.email, role: data.role, message: existingUser ? 'Integrante agregado a la tienda.' : 'Cuenta creada. Comparte la contraseña inicial de forma segura.' });
    } catch (error) {
      if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Este usuario ya forma parte de la tienda.' });
      return next(error);
    }
  });
  app.put('/api/admin/team/:userId', authenticate, requirePermission('team.manage'), async (req, res, next) => {
    try {
      const { role } = validate(z.object({ role: z.string().trim().min(2).max(80) }), req.body);
      const member = await db.prepare('SELECT role,custom_role_id FROM tenant_memberships WHERE tenant_id=? AND user_id=? AND active=1').get(req.tenant.id, req.params.userId);
      if (!member) return res.status(404).json({ error: 'No encontramos ese integrante.' });
      if (member.role === 'owner' || req.params.userId === req.user.id) return res.status(409).json({ error: 'No puedes cambiar el rol del propietario ni el tuyo.' });
      let roleValue = role; let customRoleId = null;
      if (!BUILT_IN_ROLES[role]) {
        const custom = await db.prepare('SELECT id FROM tenant_roles WHERE tenant_id=? AND id=?').get(req.tenant.id, role);
        if (!custom) return res.status(400).json({ error: 'Selecciona un rol existente.' });
        roleValue = 'custom'; customRoleId = custom.id;
      }
      if (roleValue === 'owner') return res.status(400).json({ error: 'El propietario solo puede transferirse con un flujo de seguridad dedicado.' });
      await db.prepare('UPDATE tenant_memberships SET role=?,custom_role_id=? WHERE tenant_id=? AND user_id=?').run(roleValue, customRoleId, req.tenant.id, req.params.userId);
      await audit(req.tenant.id, req.user.id, 'team.member.role.updated', 'user', req.params.userId, { role });
      return res.json({ id: req.params.userId, role });
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/team/:userId', authenticate, requirePermission('team.manage'), async (req, res) => {
    const target = await db.prepare('SELECT role FROM tenant_memberships WHERE tenant_id=? AND user_id=? AND active=1').get(req.tenant.id, req.params.userId);
    if (!target) return res.status(404).json({ error: 'No encontramos ese integrante.' });
    if (target.role === 'owner' || req.params.userId === req.user.id) return res.status(409).json({ error: 'No puedes retirar al propietario ni tu propio acceso.' });
    await db.prepare('UPDATE tenant_memberships SET active=0 WHERE tenant_id=? AND user_id=?').run(req.tenant.id, req.params.userId);
    await audit(req.tenant.id, req.user.id, 'team.member.removed', 'user', req.params.userId);
    return res.status(204).end();
  });
  app.get('/api/admin/roles', authenticate, requirePermission('roles.manage'), async (req, res) => {
    const custom = await db.prepare('SELECT id,name,permissions_json FROM tenant_roles WHERE tenant_id=? ORDER BY name').all(req.tenant.id);
    const builtIns = Object.entries(BUILT_IN_ROLES).filter(([id]) => id !== 'owner').map(([id, permissions]) => ({ id, name: id, permissions, builtIn: true }));
    res.json([...builtIns, ...custom.map((role) => ({ id: role.id, name: role.name, permissions: typeof role.permissions_json === 'string' ? JSON.parse(role.permissions_json) : role.permissions_json, builtIn: false }))]);
  });
  app.post('/api/admin/roles', authenticate, requirePermission('roles.manage'), async (req, res, next) => {
    try {
      const data = validate(roleSchema, req.body);
      const id = randomUUID();
      await db.prepare('INSERT INTO tenant_roles (id,tenant_id,name,permissions_json) VALUES (?,?,?,?)').run(id, req.tenant.id, data.name, JSON.stringify([...new Set(data.permissions)]));
      await audit(req.tenant.id, req.user.id, 'team.role.created', 'role', id);
      return res.status(201).json({ id, ...data });
    } catch (error) {
      if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' });
      return next(error);
    }
  });
  app.put('/api/admin/roles/:id', authenticate, requirePermission('roles.manage'), async (req, res, next) => {
    try {
      const data = validate(roleSchema, req.body);
      const result = await db.prepare('UPDATE tenant_roles SET name=?,permissions_json=? WHERE tenant_id=? AND id=?').run(data.name, JSON.stringify([...new Set(data.permissions)]), req.tenant.id, req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'No encontramos ese rol personalizado.' });
      await audit(req.tenant.id, req.user.id, 'team.role.updated', 'role', req.params.id);
      return res.json({ id: req.params.id, ...data });
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/roles/:id', authenticate, requirePermission('roles.manage'), async (req, res) => {
    const assigned = await db.prepare('SELECT COUNT(*) AS count FROM tenant_memberships WHERE tenant_id=? AND custom_role_id=? AND active=1').get(req.tenant.id, req.params.id);
    if (assigned.count) return res.status(409).json({ error: 'Reasigna los integrantes antes de borrar este rol.' });
    const result = await db.prepare('DELETE FROM tenant_roles WHERE tenant_id=? AND id=?').run(req.tenant.id, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'No encontramos ese rol personalizado.' });
    return res.status(204).end();
  });

  app.get('/api/platform/tenants', authenticate, superadminOnly, async (_req, res) => {
    const tenants = await db.prepare('SELECT t.id,t.name,t.slug,t.status,t.created_at,p.id AS plan_id,p.name AS plan_name,(SELECT COUNT(*) FROM products x WHERE x.tenant_id=t.id) AS products,(SELECT COUNT(*) FROM tenant_memberships m WHERE m.tenant_id=t.id AND m.active=1) AS members FROM tenants t JOIN plans p ON p.id=t.plan_id ORDER BY t.created_at DESC').all();
    res.json(tenants);
  });
  app.patch('/api/platform/tenants/:id', authenticate, superadminOnly, async (req, res, next) => {
    try {
      const data = validate(z.object({ status: z.enum(['active', 'suspended']).optional(), planId: z.string().min(1).optional() }).refine((value) => value.status || value.planId), req.body);
      const tenant = await db.prepare('SELECT id FROM tenants WHERE id=?').get(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'No encontramos esa tienda.' });
      if (data.status) await db.prepare('UPDATE tenants SET status=? WHERE id=?').run(data.status, tenant.id);
      if (data.planId) {
        const plan = await db.prepare('SELECT id,active FROM plans WHERE id=?').get(data.planId);
        if (!plan || !plan.active) return res.status(400).json({ error: 'Selecciona un plan activo.' });
        await db.prepare('UPDATE tenants SET plan_id=? WHERE id=?').run(plan.id, tenant.id);
        await db.prepare('UPDATE subscriptions SET plan_id=?,status=? WHERE tenant_id=?').run(plan.id, 'active', tenant.id);
      }
      await db.prepare('INSERT INTO audit_logs (id,tenant_id,actor_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), tenant.id, req.user.id, 'platform.tenant.updated', 'tenant', tenant.id, JSON.stringify(data));
      return res.json({ id: tenant.id, ...data });
    } catch (error) { return next(error); }
  });
  app.get('/api/platform/plans', authenticate, superadminOnly, async (_req, res) => {
    const plans = await db.prepare('SELECT * FROM plans ORDER BY max_products').all();
    res.json(plans.map((plan) => ({ ...plan, allowed_templates: typeof plan.allowed_templates === 'string' ? JSON.parse(plan.allowed_templates) : plan.allowed_templates })));
  });
  app.post('/api/platform/plans', authenticate, superadminOnly, async (req, res, next) => {
    try {
      const data = validate(z.object({ id: z.string().trim().toLowerCase().min(2).max(32).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), name: z.string().trim().min(2).max(60), maxProducts: z.coerce.number().int().min(1).max(100000), maxMembers: z.coerce.number().int().min(1).max(10000), allowedTemplates: z.array(z.enum(THEMES)).min(1), customFonts: z.boolean() }), req.body);
      await db.prepare('INSERT INTO plans (id,name,max_products,max_members,allowed_templates,custom_fonts) VALUES (?,?,?,?,?,?)').run(data.id, data.name, data.maxProducts, data.maxMembers, JSON.stringify([...new Set(data.allowedTemplates)]), Number(data.customFonts));
      return res.status(201).json(data);
    } catch (error) {
      if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ya existe un plan con ese identificador.' });
      return next(error);
    }
  });
  app.put('/api/platform/plans/:id', authenticate, superadminOnly, async (req, res, next) => {
    try {
      const data = validate(z.object({ name: z.string().trim().min(2).max(60), maxProducts: z.coerce.number().int().min(1).max(100000), maxMembers: z.coerce.number().int().min(1).max(10000), allowedTemplates: z.array(z.enum(THEMES)).min(1), customFonts: z.boolean(), active: z.boolean() }), req.body);
      const result = await db.prepare('UPDATE plans SET name=?,max_products=?,max_members=?,allowed_templates=?,custom_fonts=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(data.name, data.maxProducts, data.maxMembers, JSON.stringify([...new Set(data.allowedTemplates)]), Number(data.customFonts), Number(data.active), req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'No encontramos ese plan.' });
      return res.json({ id: req.params.id, ...data });
    } catch (error) { return next(error); }
  });

  app.get('/api/admin/products', authenticate, requirePermission('catalog.read'), async (req, res) => {
    const rows = await db.prepare('SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.tenant_id=? ORDER BY p.created_at DESC').all(req.tenant.id);
    res.json(rows.map((row) => ({ ...mapProduct(row), categoryName: row.category_name, categorySlug: row.category_slug })));
  });
  const persistProduct = async (data, tenantId, id = randomUUID()) => {
    if (!await db.prepare('SELECT id FROM categories WHERE tenant_id=? AND id = ?').get(tenantId, data.categoryId)) { const error = new Error('Selecciona una categoría válida.'); error.status = 400; throw error; }
    const slug = data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + id.slice(0, 5);
    await db.prepare('INSERT INTO products (id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured,tenant_id) ' +
      'VALUES (@id,@name,@subtitle,@slug,@category_id,@description,@price,@image,@sizes,@colors,@stock,@featured,@tenant_id) ' +
      'ON CONFLICT(id) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,category_id=excluded.category_id,description=excluded.description,' +
      'price=excluded.price,image=excluded.image,sizes=excluded.sizes,colors=excluded.colors,stock=excluded.stock,featured=excluded.featured,tenant_id=excluded.tenant_id')
      .run({ ...data, id, slug, category_id: data.categoryId, sizes: JSON.stringify(data.sizes), colors: JSON.stringify(data.colors), featured: Number(data.featured), tenant_id: tenantId });
    return id;
  };
  app.post('/api/admin/products', authenticate, requirePermission('catalog.manage'), async (req, res, next) => {
    try {
      const data = validate(productSchema, req.body);
      const count = await db.prepare('SELECT COUNT(*) AS count FROM products WHERE tenant_id=?').get(req.tenant.id);
      if (count.count >= req.tenant.max_products) return res.status(409).json({ error: 'Alcanzaste el límite de productos de tu plan. Cambia de plan para ampliar el catálogo.' });
      const id = await persistProduct(data, req.tenant.id);
      await audit(req.tenant.id, req.user.id, 'catalog.product.created', 'product', id);
      res.status(201).json({ id, message: 'Producto creado.' });
    } catch (error) { next(error); }
  });
  app.put('/api/admin/products/:id', authenticate, requirePermission('catalog.manage'), async (req, res, next) => {
    try {
      const existing = await db.prepare('SELECT id FROM products WHERE tenant_id=? AND id = ?').get(req.tenant.id, req.params.id);
      if (!existing) return res.status(404).json({ error: 'No encontramos ese producto.' });
      const data = validate(productSchema, req.body);
      await persistProduct(data, req.tenant.id, existing.id);
      await audit(req.tenant.id, req.user.id, 'catalog.product.updated', 'product', existing.id);
      return res.json({ id: existing.id, message: 'Cambios guardados.' });
    } catch (error) { return next(error); }
  });
  app.patch('/api/admin/products/:id/stock', authenticate, requirePermission('inventory.manage'), async (req, res, next) => {
    try {
      const { stock } = validate(z.object({ stock: z.coerce.number().int().min(0).max(100000) }), req.body);
      const result = await db.prepare('UPDATE products SET stock=? WHERE tenant_id=? AND id=?').run(stock, req.tenant.id, req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'No encontramos esa prenda.' });
      await audit(req.tenant.id, req.user.id, 'inventory.stock.updated', 'product', req.params.id, { stock });
      return res.json({ id: req.params.id, stock });
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/products/:id', authenticate, requirePermission('catalog.manage'), async (req, res) => {
    const result = await db.prepare('DELETE FROM products WHERE tenant_id=? AND id = ?').run(req.tenant.id, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'No encontramos ese producto.' });
    await audit(req.tenant.id, req.user.id, 'catalog.product.deleted', 'product', req.params.id);
    return res.status(204).end();
  });
  app.post('/api/admin/categories', authenticate, requirePermission('catalog.manage'), async (req, res, next) => {
    try {
      const data = validate(categorySchema, req.body);
      const id = randomUUID();
      await db.prepare('INSERT INTO categories (id,name,slug,tenant_id) VALUES (?,?,?,?)').run(id, data.name, data.slug, req.tenant.id);
      await audit(req.tenant.id, req.user.id, 'catalog.category.created', 'category', id);
      return res.status(201).json({ id, ...data });
    } catch (error) { if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre o URL.' }); return next(error); }
  });
  app.put('/api/admin/categories/:id', authenticate, requirePermission('catalog.manage'), async (req, res, next) => {
    try {
      const data = validate(categorySchema, req.body);
      const result = await db.prepare('UPDATE categories SET name=?,slug=? WHERE tenant_id=? AND id=?').run(data.name, data.slug, req.tenant.id, req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'No encontramos esa categoría.' });
      await audit(req.tenant.id, req.user.id, 'catalog.category.updated', 'category', req.params.id);
      return res.json({ id: req.params.id, ...data });
    } catch (error) { if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre o URL.' }); return next(error); }
  });
  app.delete('/api/admin/categories/:id', authenticate, requirePermission('catalog.manage'), async (req, res) => {
    try {
      const result = await db.prepare('DELETE FROM categories WHERE tenant_id=? AND id=?').run(req.tenant.id, req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'No encontramos esa categoría.' });
      await audit(req.tenant.id, req.user.id, 'catalog.category.deleted', 'category', req.params.id);
      return res.status(204).end();
    } catch (error) {
      if (['SQLITE_CONSTRAINT_FOREIGNKEY', '23503'].includes(error.code)) return res.status(409).json({ error: 'Mueve o elimina los productos de esta categoría antes de borrarla.' });
      throw error;
    }
  });

  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('*path', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return res.sendFile(path.join(staticDir, 'index.html'), (error) => error && next(error));
    });
  }
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = error.status || (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code) ? 409 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status === 500 ? 'Ocurrió un error interno. Inténtalo de nuevo.' : error.message });
  });
  return app;
}
