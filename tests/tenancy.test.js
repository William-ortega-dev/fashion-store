import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createStore } from '../server/db.js';

const imageUrl = 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea';
const productPayload = (categoryId, name = 'Prenda de prueba') => ({
  name, subtitle: 'Edición de muestra', categoryId,
  description: 'Una prenda creada para comprobar los límites del catálogo.', price: 199000,
  image: imageUrl, sizes: ['S', 'M'], colors: ['Arena'], stock: 4, featured: true,
});

describe('plataforma multi-tenant', () => {
  let db;
  let app;
  let defaultAdminPassword;

  beforeEach(() => {
    defaultAdminPassword = randomUUID() + 'Aa1!';
    db = createStore(':memory:', { email: 'admin@example.test', password: defaultAdminPassword });
    app = createApp({ db, sessionSecret: randomUUID() + randomUUID() });
  });
  afterEach(() => db?.close());

  async function createTenant(agent = request.agent(app), slug = 'luna-studio') {
    const response = await agent.post('/api/stores').send({
      name: 'Luna Studio', slug, ownerName: 'Lucía Dueña', email: `${slug}@example.test`, password: 'LunaPassword-2026!long',
    }).expect(201);
    return { agent, ...response.body };
  }

  it('crea tiendas aisladas y conserva el catálogo Atelier como predeterminado', async () => {
    const created = await createTenant();
    expect(created.url).toBe('/tienda/luna-studio/');
    const atelier = await request(app).get('/api/products').expect(200);
    expect(atelier.body).toHaveLength(9);
    const otherCatalog = await created.agent.get('/api/products?store=luna-studio').expect(200);
    expect(otherCatalog.body).toEqual([]);
    const atelierCategory = (await request(app).get('/api/categories')).body[0];
    await created.agent.post('/api/admin/products?store=luna-studio').send(productPayload(atelierCategory.id)).expect(400);
    const category = await created.agent.post('/api/admin/categories?store=luna-studio').send({ name: 'Abrigos', slug: 'abrigos' }).expect(201);
    const product = await created.agent.post('/api/admin/products?store=luna-studio').send(productPayload(category.body.id)).expect(201);
    expect((await created.agent.get('/api/admin/products?store=luna-studio').expect(200)).body).toHaveLength(1);
    await request(app).get('/api/products/' + (await created.agent.get('/api/admin/products?store=luna-studio')).body[0].slug).expect(404);
    expect(product.body.id).toBeTruthy();
  });

  it('aplica cuotas de catálogo en servidor y publica branding solo tras confirmar', async () => {
    await db.prepare('UPDATE plans SET max_products=1 WHERE id=?').run('basic');
    const created = await createTenant(request.agent(app), 'atelier-limite');
    const category = await created.agent.post('/api/admin/categories?store=atelier-limite').send({ name: 'Tops', slug: 'tops' }).expect(201);
    await created.agent.post('/api/admin/products?store=atelier-limite').send(productPayload(category.body.id, 'Primera prenda')).expect(201);
    await created.agent.post('/api/admin/products?store=atelier-limite').send(productPayload(category.body.id, 'Segunda prenda')).expect(409);

    const current = (await created.agent.get('/api/admin/storefront?store=atelier-limite').expect(200)).body;
    const draft = { ...current.draft, template: 'editorial', brandName: 'Luna Studio', primaryColor: '#342e29' };
    await created.agent.put('/api/admin/storefront?store=atelier-limite').send({ ...draft, template: 'urbano' }).expect(403);
    await created.agent.put('/api/admin/storefront?store=atelier-limite').send(draft).expect(200);
    expect((await created.agent.get('/api/storefront?store=atelier-limite').expect(200)).body.brand.template).toBe('minimal');
    await created.agent.post('/api/admin/storefront/publish?store=atelier-limite').send({}).expect(200);
    expect((await created.agent.get('/api/storefront?store=atelier-limite').expect(200)).body.brand).toMatchObject({ template: 'editorial', brandName: 'Luna Studio' });
  });

  it('limita a los miembros a sus permisos y permite roles personalizados', async () => {
    const created = await createTenant(request.agent(app), 'casa-equipo');
    await created.agent.post('/api/admin/team?store=casa-equipo').send({ name: 'Sofía Vende', email: 'sofia@example.test', password: 'SofiaPassword-2026!', role: 'seller' }).expect(201);
    const seller = request.agent(app);
    const login = await seller.post('/api/auth/login?store=casa-equipo').send({ email: 'sofia@example.test', password: 'SofiaPassword-2026!' }).expect(200);
    expect(login.body.user).toMatchObject({ role: 'seller', permissions: ['catalog.read', 'orders.read', 'orders.manage'] });
    await seller.get('/api/admin/products?store=casa-equipo').expect(200);
    await seller.post('/api/admin/categories?store=casa-equipo').send({ name: 'Faldas', slug: 'faldas' }).expect(403);

    const custom = await created.agent.post('/api/admin/roles?store=casa-equipo').send({ name: 'Solo lectura', permissions: ['catalog.read'] }).expect(201);
    await created.agent.post('/api/admin/team?store=casa-equipo').send({ name: 'Mateo Lee', email: 'mateo@example.test', password: 'MateoPassword-2026!', role: custom.body.id }).expect(409);
    await created.agent.delete('/api/admin/team/' + login.body.user.id + '?store=casa-equipo').expect(204);
  });

  it('consulta y actualiza pedidos solo en el tenant actual', async () => {
    const first = await createTenant(request.agent(app), 'pedido-casa');
    const category = await first.agent.post('/api/admin/categories?store=pedido-casa').send({ name: 'Pantalones', slug: 'pantalones' }).expect(201);
    const product = await first.agent.post('/api/admin/products?store=pedido-casa').send(productPayload(category.body.id, 'Pantalón de lino')).expect(201);
    const checkout = await first.agent.post('/api/checkout?store=pedido-casa').send({
      shipping: { name: 'Lucía Dueña', email: 'pedido-casa@example.test', address: 'Calle 10 # 5-20', city: 'Bogotá' },
      items: [{ productId: product.body.id, quantity: 1, size: 'M', color: 'Arena' }],
    }).expect(201);
    expect((await first.agent.get('/api/admin/orders?store=pedido-casa').expect(200)).body).toHaveLength(1);
    await first.agent.patch('/api/admin/orders/' + checkout.body.id + '?store=pedido-casa').send({ status: 'processing' }).expect(200);
    await first.agent.patch('/api/admin/orders/' + checkout.body.id + '?store=pedido-casa').send({ status: 'shipped' }).expect(200);
    await first.agent.patch('/api/admin/orders/' + checkout.body.id + '?store=pedido-casa').send({ status: 'processing' }).expect(409);
    const second = await createTenant(request.agent(app), 'otro-pedido');
    await second.agent.get('/api/orders/' + checkout.body.id + '?store=otro-pedido').expect(404);
    expect((await second.agent.get('/api/admin/orders?store=otro-pedido').expect(200)).body).toEqual([]);
  });

  it('guarda imágenes por tenant y no las entrega desde otra tienda', async () => {
    const first = await createTenant(request.agent(app), 'tierra-studio');
    const second = await createTenant(request.agent(app), 'mar-studio');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/sZ0AAAAASUVORK5CYII=', 'base64');
    const upload = await first.agent.post('/api/admin/assets?store=tierra-studio').set('Content-Type', 'image/png').send(png).expect(201);
    expect(upload.body.url).toContain('store=tierra-studio');
    const retrieved = await first.agent.get(upload.body.url).expect(200);
    expect(retrieved.headers['content-type']).toContain('image/png');
    await second.agent.get(upload.body.url.replace('store=tierra-studio', 'store=mar-studio')).expect(404);
    await first.agent.delete('/api/admin/assets/' + upload.body.id + '?store=tierra-studio').expect(204);
    await first.agent.post('/api/admin/assets?store=tierra-studio').set('Content-Type', 'image/png').send(Buffer.from('not an image')).expect(415);
  });

  it('separa el acceso al panel de plataforma de las cuentas de tienda', async () => {
    await db.prepare('UPDATE users SET platform_role=? WHERE email=?').run('superadmin', 'admin@example.test');
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email: 'admin@example.test', password: defaultAdminPassword }).expect(200);
    expect((await admin.get('/api/platform/tenants').expect(200)).body.some((tenant) => tenant.slug === 'atelier-n8')).toBe(true);
    await admin.put('/api/platform/plans/basic').send({ name: 'Esencial ajustado', maxProducts: 30, maxMembers: 3, allowedTemplates: ['minimal'], customFonts: false, active: true }).expect(200);
    const newPlan = await admin.post('/api/platform/plans').send({ id: 'portfolio-plus', name: 'Portafolio Plus', maxProducts: 75, maxMembers: 5, allowedTemplates: ['minimal', 'editorial', 'moderno'], customFonts: true }).expect(201);
    expect(newPlan.body).toMatchObject({ id: 'portfolio-plus', maxProducts: 75 });
    expect((await admin.get('/api/plans').expect(200)).body.some((plan) => plan.name === 'Esencial ajustado')).toBe(true);
  });
});
