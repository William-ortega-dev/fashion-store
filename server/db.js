import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { seedCategories, seedProducts } from './catalog-seed.js';
import { mapProduct } from './product-model.js';

export { seedCategories, seedProducts, mapProduct };

export function createStore(databasePath = process.env.DATABASE_PATH || './data/fashion-store.db', adminAccount = {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
}) {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL UNIQUE, category_id TEXT NOT NULL REFERENCES categories(id),
      description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0),
      image TEXT NOT NULL, sizes TEXT NOT NULL, colors TEXT NOT NULL,
      stock INTEGER NOT NULL CHECK(stock >= 0), featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'confirmed', total INTEGER NOT NULL,
      items_json TEXT NOT NULL, shipping_json TEXT NOT NULL, demo_payment_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
    CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id);
  `);
  const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  if (!categoryCount) {
    const addCategory = db.prepare('INSERT INTO categories (id, name, slug) VALUES (@id, @name, @slug)');
    const addProduct = db.prepare('INSERT INTO products (id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured) VALUES (@id,@name,@subtitle,@slug,@category_id,@description,@price,@image,@sizes,@colors,@stock,@featured)');
    db.transaction(() => {
      for (const category of seedCategories) addCategory.run(category);
      for (const item of seedProducts) {
        const { category, ...product } = item;
        const categoryRecord = seedCategories.find((entry) => entry.slug === category);
        addProduct.run({ ...product, slug: item.id.replace(/^prd-/, ''), category_id: categoryRecord.id, sizes: JSON.stringify(item.sizes), colors: JSON.stringify(item.colors) });
      }
    })();
  }
  if (adminAccount?.email && adminAccount?.password) {
    if (adminAccount.password.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters.');
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminAccount.email.toLowerCase());
    if (!admin) db.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)')
      .run('seed-admin', 'Administración Atelier', adminAccount.email.toLowerCase(), bcrypt.hashSync(adminAccount.password, 12), 'admin');
  }
  let transactionQueue = Promise.resolve();
  return {
    prepare: db.prepare.bind(db),
    exec: db.exec.bind(db),
    close: db.close.bind(db),
    transaction(callback) {
      return async (...args) => {
        let release;
        const previous = transactionQueue;
        transactionQueue = new Promise((resolve) => { release = resolve; });
        await previous;
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await callback(this, ...args);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        } finally {
          release();
        }
      };
    },
  };
}
