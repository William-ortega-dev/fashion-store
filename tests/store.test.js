import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createStore } from '../server/db.js';

describe('Atelier N°8 API', () => {
  let db;
  let app;
  let adminPassword;
  let customerPassword;

  beforeEach(() => {
    adminPassword = randomUUID() + 'Aa1!';
    customerPassword = randomUUID() + 'Bb2!';
    db = createStore(':memory:', { email: 'admin@example.test', password: adminPassword });
    app = createApp({ db, sessionSecret: randomUUID() });
  });
  afterEach(() => db?.close());

  it('publica el catálogo de muestra y aplica filtros del servidor', async () => {
    const products = await request(app).get('/api/products').expect(200);
    expect(products.body).toHaveLength(9);
    const filtered = await request(app).get('/api/products?category=tops&size=S&maxPrice=200000').expect(200);
    expect(filtered.body).toHaveLength(2);
    expect(filtered.body.every((product) => product.categorySlug === 'tops' && product.sizes.includes('S'))).toBe(true);
  });

  it('registra usuarios con rol cliente y bloquea el panel administrativo', async () => {
    const agent = request.agent(app);
    const registration = await agent.post('/api/auth/register').send({ name: 'Ana Demo', email: 'ANA@example.com', password: customerPassword }).expect(200);
    expect(registration.body.user).toMatchObject({ name: 'Ana Demo', email: 'ana@example.com', role: 'customer' });
    expect(registration.headers['set-cookie'][0]).toContain('HttpOnly');
    await agent.get('/api/admin/products').expect(403);
    await agent.post('/api/auth/register').send({ name: 'Ana Demo', email: 'ana@example.com', password: customerPassword }).expect(409);
  });

  it('crea pedidos demo y descuenta el inventario dentro de una transacción', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ name: 'Ana Demo', email: 'ana@example.com', password: customerPassword }).expect(200);
    const shipping = { name: 'Ana Demo', email: 'ana@example.com', address: 'Calle 10 # 5-20', city: 'Bogotá' };
    await agent.post('/api/checkout').send({ shipping, items: [{ productId: 'prd-linen-shirt', quantity: 19, size: 'M', color: 'Marfil' }] }).expect(409);
    const result = await agent.post('/api/checkout').send({ shipping, items: [{ productId: 'prd-linen-shirt', quantity: 2, size: 'M', color: 'Marfil' }] }).expect(201);
    expect(result.body).toMatchObject({ status: 'confirmed', total: 378000, shipping, paymentId: expect.stringMatching(/^DEMO-/) });
    expect((await request(app).get('/api/products/linen-shirt')).body.stock).toBe(16);
    const fetched = await agent.get('/api/orders/' + result.body.id).expect(200);
    expect(fetched.body.items[0]).toMatchObject({ quantity: 2, size: 'M', color: 'Marfil' });
  });

  it('permite al administrador gestionar productos, categorías e inventario', async () => {
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email: 'admin@example.test', password: adminPassword }).expect(200);
    const category = await admin.post('/api/admin/categories').send({ name: 'Capas', slug: 'capas' }).expect(201);
    const product = await admin.post('/api/admin/products').send({
      name: 'Capa de muestra', subtitle: 'Edición de prueba', categoryId: category.body.id,
      description: 'Una prenda creada para comprobar el catálogo.', price: 199000,
      image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea',
      sizes: ['S', 'M'], colors: ['Arena'], stock: 4, featured: true,
    }).expect(201);
    await admin.put('/api/admin/products/' + product.body.id).send({
      name: 'Capa de muestra', subtitle: 'Edición de prueba', categoryId: category.body.id,
      description: 'Una prenda creada para comprobar el catálogo.', price: 199000,
      image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea',
      sizes: ['S', 'M'], colors: ['Arena'], stock: 7, featured: true,
    }).expect(200);
    const inventory = await admin.get('/api/admin/products').expect(200);
    expect(inventory.body.find((item) => item.id === product.body.id).stock).toBe(7);
    await admin.delete('/api/admin/categories/' + category.body.id).expect(409);
    await admin.delete('/api/admin/products/' + product.body.id).expect(204);
    await admin.delete('/api/admin/categories/' + category.body.id).expect(204);
  });
});
