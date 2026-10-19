import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/db.js';

describe('migración de bases SQLite anteriores al modelo SaaS', () => {
  let tempRoot;
  let migrated;
  afterEach(() => {
    migrated?.close(); migrated = undefined;
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  });

  it('conserva catálogo, inventario, usuario y pedidos en el tenant de Atelier', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-legacy-'));
    const file = path.join(tempRoot, 'legacy.db');
    const old = new Database(file);
    old.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE categories (id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE);
      CREATE TABLE products (id TEXT PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT NOT NULL DEFAULT '',slug TEXT NOT NULL UNIQUE,category_id TEXT NOT NULL REFERENCES categories(id),description TEXT NOT NULL,price INTEGER NOT NULL,image TEXT NOT NULL,sizes TEXT NOT NULL,colors TEXT NOT NULL,stock INTEGER NOT NULL,featured INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE users (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE orders (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL,total INTEGER NOT NULL,items_json TEXT NOT NULL,shipping_json TEXT NOT NULL,demo_payment_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX products_category_idx ON products(category_id);
      CREATE INDEX orders_user_idx ON orders(user_id);
      INSERT INTO categories (id,name,slug) VALUES ('old-category','Edición antigua','edicion');
      INSERT INTO products (id,name,slug,category_id,description,price,image,sizes,colors,stock,featured) VALUES ('old-product','Camisa antigua','camisa-antigua','old-category','Prenda preservada por la migración',145000,'https://example.com/shirt.jpg','["M"]','["Marfil"]',7,1);
      INSERT INTO users (id,name,email,password_hash,role) VALUES ('old-user','Admin antiguo','old-admin@example.test','hash','admin');
      INSERT INTO orders (id,user_id,status,total,items_json,shipping_json,demo_payment_id) VALUES ('old-order','old-user','confirmed',145000,'[]','{}','DEMO-OLD');
    `);
    old.close();

    migrated = createStore(file);
    expect(migrated.prepare('SELECT tenant_id FROM categories WHERE id=?').get('old-category').tenant_id).toBe('tenant-atelier-n8');
    expect(migrated.prepare('SELECT tenant_id,stock FROM products WHERE id=?').get('old-product')).toMatchObject({ tenant_id: 'tenant-atelier-n8', stock: 7 });
    expect(migrated.prepare('SELECT tenant_id FROM orders WHERE id=?').get('old-order').tenant_id).toBe('tenant-atelier-n8');
    expect(migrated.prepare('SELECT role FROM tenant_memberships WHERE user_id=? AND tenant_id=?').get('old-user', 'tenant-atelier-n8').role).toBe('owner');
    expect(migrated.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const scopedSlugIndex = migrated.prepare('PRAGMA index_list(categories)').all().filter((index) => index.unique)
      .some((index) => migrated.prepare(`PRAGMA index_info('${index.name}')`).all().map((column) => column.name).join(',') === 'tenant_id,slug');
    expect(scopedSlugIndex).toBe(true);
  });
});
