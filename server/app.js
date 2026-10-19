import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { mapProduct } from './product-model.js';

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(128);
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
  const signToken = (user) => jwt.sign({ sub: user.id, role: user.role, name: user.name }, sessionSecret, { expiresIn: '7d' });
  const sendSession = (res, user) => {
    res.cookie(cookieName, signToken(user), { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({ user });
  };
  const authenticate = async (req, res, next) => {
    try {
      const token = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1);
      if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
      const claims = jwt.verify(decodeURIComponent(token), sessionSecret);
      const user = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(claims.sub);
      if (!user) return res.status(401).json({ error: 'La sesión ya no es válida.' });
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ error: 'La sesión ya no es válida.' });
    }
  };
  const adminOnly = (req, res, next) => req.user?.role === 'admin'
    ? next()
    : res.status(403).json({ error: 'Necesitas una cuenta administradora.' });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/categories', async (_req, res) => {
    res.json(await db.prepare('SELECT id, name, slug FROM categories ORDER BY name').all());
  });
  app.get('/api/products', async (req, res) => {
    const where = [];
    const params = [];
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
    const rows = await db.prepare('SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id ' +
      (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + sort).all(...params);
    res.json(rows.map((row) => ({ ...mapProduct(row), categoryName: row.category_name, categorySlug: row.category_slug })));
  });
  app.get('/api/products/:slug', async (req, res) => {
    const row = await db.prepare('SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id WHERE p.slug = ?').get(req.params.slug);
    if (!row) return res.status(404).json({ error: 'No encontramos esa prenda.' });
    return res.json({ ...mapProduct(row), categoryName: row.category_name, categorySlug: row.category_slug });
  });
  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const data = validate(z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema }), req.body);
      const user = { id: randomUUID(), name: data.name, email: data.email, role: 'customer' };
      await db.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)')
        .run(user.id, user.name, user.email, bcrypt.hashSync(data.password, 10), user.role);
      sendSession(res, user);
    } catch (error) { if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ese correo ya tiene una cuenta.' }); next(error); }
  });
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const data = validate(z.object({ email: emailSchema, password: passwordSchema }), req.body);
      const record = await db.prepare('SELECT id,name,email,password_hash,role FROM users WHERE email = ?').get(data.email);
      if (!record || !bcrypt.compareSync(data.password, record.password_hash)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
      const { password_hash: _hash, ...user } = record;
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
          const product = await tx.prepare('SELECT id,name,price,stock,sizes,colors FROM products WHERE id = ?').get(item.productId);
          if (!product) { const error = new Error('Una prenda del carrito ya no está disponible.'); error.status = 409; throw error; }
          if (!JSON.parse(product.sizes).includes(item.size) || !JSON.parse(product.colors).includes(item.color)) { const error = new Error('Una talla o color seleccionado ya no está disponible.'); error.status = 409; throw error; }
          if (product.stock < item.quantity) { const error = new Error('No hay existencias suficientes de ' + product.name + '.'); error.status = 409; throw error; }
          const stockUpdate = await tx.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?')
            .run(item.quantity, product.id, item.quantity);
          if (!stockUpdate.changes) { const error = new Error('No hay existencias suficientes de ' + product.name + '.'); error.status = 409; throw error; }
          total += product.price * item.quantity;
          resolved.push({ productId: product.id, name: product.name, price: product.price, quantity: item.quantity, size: item.size, color: item.color });
        }
        await tx.prepare('INSERT INTO orders (id,user_id,status,total,items_json,shipping_json,demo_payment_id) VALUES (?,?,?,?,?,?,?)')
          .run(id, req.user.id, 'confirmed', total, JSON.stringify(resolved), JSON.stringify(shipping), paymentId);
        return { id, status: 'confirmed', total, items: resolved, shipping, paymentId, createdAt: new Date().toISOString() };
      });
      return res.status(201).json(await createOrder());
    } catch (error) { return next(error); }
  });
  app.get('/api/orders/:id', authenticate, async (req, res) => {
    const order = await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!order && req.user.role !== 'admin') return res.status(404).json({ error: 'No encontramos ese pedido.' });
    const found = order || await db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!found) return res.status(404).json({ error: 'No encontramos ese pedido.' });
    return res.json({ id: found.id, status: found.status, total: found.total, items: JSON.parse(found.items_json), shipping: JSON.parse(found.shipping_json), paymentId: found.demo_payment_id, createdAt: found.created_at });
  });

  app.get('/api/admin/products', authenticate, adminOnly, async (_req, res) => {
    const rows = await db.prepare('SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC').all();
    res.json(rows.map((row) => ({ ...mapProduct(row), categoryName: row.category_name, categorySlug: row.category_slug })));
  });
  const persistProduct = async (data, id = randomUUID()) => {
    if (!await db.prepare('SELECT id FROM categories WHERE id = ?').get(data.categoryId)) { const error = new Error('Selecciona una categoría válida.'); error.status = 400; throw error; }
    const slug = data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + id.slice(0, 5);
    await db.prepare('INSERT INTO products (id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured) ' +
      'VALUES (@id,@name,@subtitle,@slug,@category_id,@description,@price,@image,@sizes,@colors,@stock,@featured) ' +
      'ON CONFLICT(id) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,category_id=excluded.category_id,description=excluded.description,' +
      'price=excluded.price,image=excluded.image,sizes=excluded.sizes,colors=excluded.colors,stock=excluded.stock,featured=excluded.featured')
      .run({ ...data, id, slug, category_id: data.categoryId, sizes: JSON.stringify(data.sizes), colors: JSON.stringify(data.colors), featured: Number(data.featured) });
    return id;
  };
  app.post('/api/admin/products', authenticate, adminOnly, async (req, res, next) => {
    try {
      const data = validate(productSchema, req.body);
      const id = await persistProduct(data);
      res.status(201).json({ id, message: 'Producto creado.' });
    } catch (error) { next(error); }
  });
  app.put('/api/admin/products/:id', authenticate, adminOnly, async (req, res, next) => {
    try {
      const existing = await db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'No encontramos ese producto.' });
      const data = validate(productSchema, req.body);
      await persistProduct(data, existing.id);
      return res.json({ id: existing.id, message: 'Cambios guardados.' });
    } catch (error) { return next(error); }
  });
  app.delete('/api/admin/products/:id', authenticate, adminOnly, async (req, res) => {
    const result = await db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'No encontramos ese producto.' });
    return res.status(204).end();
  });
  app.post('/api/admin/categories', authenticate, adminOnly, async (req, res, next) => {
    try {
      const data = validate(categorySchema, req.body);
      const id = randomUUID();
      await db.prepare('INSERT INTO categories (id,name,slug) VALUES (?,?,?)').run(id, data.name, data.slug);
      return res.status(201).json({ id, ...data });
    } catch (error) { if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre o URL.' }); return next(error); }
  });
  app.put('/api/admin/categories/:id', authenticate, adminOnly, async (req, res, next) => {
    try {
      const data = validate(categorySchema, req.body);
      const result = await db.prepare('UPDATE categories SET name=?,slug=? WHERE id=?').run(data.name, data.slug, req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'No encontramos esa categoría.' });
      return res.json({ id: req.params.id, ...data });
    } catch (error) { if (['SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(error.code)) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre o URL.' }); return next(error); }
  });
  app.delete('/api/admin/categories/:id', authenticate, adminOnly, async (req, res) => {
    try {
      const result = await db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
      if (!result.changes) return res.status(404).json({ error: 'No encontramos esa categoría.' });
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
