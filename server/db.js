import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { seedCategories, seedProducts } from './catalog-seed.js';
import { mapProduct } from './product-model.js';
import { DEFAULT_BRAND, DEFAULT_PLANS, DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from './tenant-model.js';

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
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, tenant_id TEXT, UNIQUE(tenant_id, slug));
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id),
      description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0),
      image TEXT NOT NULL, sizes TEXT NOT NULL, colors TEXT NOT NULL,
      stock INTEGER NOT NULL CHECK(stock >= 0), featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT, UNIQUE(tenant_id, slug)
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, platform_role TEXT NOT NULL DEFAULT 'none'
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'confirmed', total INTEGER NOT NULL,
      items_json TEXT NOT NULL, shipping_json TEXT NOT NULL, demo_payment_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT
    );
    CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
    CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id);
  `);
  const ensureColumn = (table, column, definition) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn('categories', 'tenant_id', 'TEXT');
  ensureColumn('products', 'tenant_id', 'TEXT');
  ensureColumn('orders', 'tenant_id', 'TEXT');
  ensureColumn('users', 'platform_role', "TEXT NOT NULL DEFAULT 'none'");

  // Older local databases used globally unique slugs. Rebuild the two tables
  // with tenant-scoped uniqueness while preserving every existing row.
  const hasGlobalSlugConstraint = (table) => db.prepare(`PRAGMA index_list(${table})`).all()
    .filter((index) => index.unique)
    .some((index) => db.prepare(`PRAGMA index_info('${index.name.replace(/'/g, "''")}')`).all().map((column) => column.name).join(',') === 'slug');
  const rebuildLegacyTables = db.transaction(() => {
    if (hasGlobalSlugConstraint('categories')) {
      db.exec(`CREATE TABLE categories__new (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, tenant_id TEXT, UNIQUE(tenant_id,slug));
        INSERT INTO categories__new (id,name,slug,tenant_id) SELECT id,name,slug,tenant_id FROM categories;
        DROP TABLE categories; ALTER TABLE categories__new RENAME TO categories;`);
    }
    if (hasGlobalSlugConstraint('products')) {
      db.exec(`CREATE TABLE products__new (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id), description TEXT NOT NULL,
        price INTEGER NOT NULL CHECK(price >= 0), image TEXT NOT NULL, sizes TEXT NOT NULL,
        colors TEXT NOT NULL, stock INTEGER NOT NULL CHECK(stock >= 0), featured INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT, UNIQUE(tenant_id,slug));
        INSERT INTO products__new (id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured,created_at,tenant_id)
          SELECT id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured,created_at,tenant_id FROM products;
        DROP TABLE products; ALTER TABLE products__new RENAME TO products;`);
    }
  });
  db.pragma('foreign_keys = OFF');
  rebuildLegacyTables();
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, max_products INTEGER NOT NULL, max_members INTEGER NOT NULL,
      allowed_templates TEXT NOT NULL, custom_fonts INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
      plan_id TEXT NOT NULL REFERENCES plans(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id), plan_id TEXT NOT NULL REFERENCES plans(id),
      status TEXT NOT NULL DEFAULT 'trialing', provider TEXT, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      current_period_end TEXT
    );
    CREATE TABLE IF NOT EXISTS tenant_memberships (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL, custom_role_id TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(tenant_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS tenant_roles (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL, permissions_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id,name)
    );
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      draft_json TEXT NOT NULL, published_json TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS store_assets (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,storage_key)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      actor_id TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id,category_id);
    CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories(tenant_id,slug);
    CREATE INDEX IF NOT EXISTS orders_tenant_idx ON orders(tenant_id,user_id);
    CREATE INDEX IF NOT EXISTS memberships_user_idx ON tenant_memberships(user_id,tenant_id);
  `);

  for (const plan of DEFAULT_PLANS) {
    db.prepare('INSERT INTO plans (id,name,max_products,max_members,allowed_templates,custom_fonts) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .run(plan.id, plan.name, plan.maxProducts, plan.maxMembers, JSON.stringify(plan.allowedTemplates), Number(plan.customFonts));
  }
  db.prepare('INSERT INTO tenants (id,name,slug,plan_id) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING')
    .run(DEFAULT_TENANT_ID, 'Atelier N°8', DEFAULT_TENANT_SLUG, 'pro');
  db.prepare('UPDATE categories SET tenant_id=? WHERE tenant_id IS NULL').run(DEFAULT_TENANT_ID);
  db.prepare('UPDATE products SET tenant_id=? WHERE tenant_id IS NULL').run(DEFAULT_TENANT_ID);
  db.prepare('UPDATE orders SET tenant_id=? WHERE tenant_id IS NULL').run(DEFAULT_TENANT_ID);
  db.prepare('INSERT INTO subscriptions (id,tenant_id,plan_id,status,provider) VALUES (?,?,?,?,NULL) ON CONFLICT(tenant_id) DO NOTHING')
    .run('subscription-atelier-n8', DEFAULT_TENANT_ID, 'pro', 'active');
  db.prepare('INSERT INTO tenant_settings (tenant_id,draft_json,published_json) VALUES (?,?,?) ON CONFLICT(tenant_id) DO NOTHING')
    .run(DEFAULT_TENANT_ID, JSON.stringify(DEFAULT_BRAND), JSON.stringify(DEFAULT_BRAND));
  const membershipInsert = db.prepare('INSERT INTO tenant_memberships (tenant_id,user_id,role) VALUES (?,?,?) ON CONFLICT(tenant_id,user_id) DO NOTHING');
  for (const user of db.prepare("SELECT id FROM users WHERE role='admin'").all()) membershipInsert.run(DEFAULT_TENANT_ID, user.id, 'owner');
  const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  if (!categoryCount) {
    const addCategory = db.prepare('INSERT INTO categories (id, name, slug, tenant_id) VALUES (@id, @name, @slug, @tenant_id)');
    const addProduct = db.prepare('INSERT INTO products (id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured,tenant_id) VALUES (@id,@name,@subtitle,@slug,@category_id,@description,@price,@image,@sizes,@colors,@stock,@featured,@tenant_id)');
    db.transaction(() => {
      for (const category of seedCategories) addCategory.run({ ...category, tenant_id: DEFAULT_TENANT_ID });
      for (const item of seedProducts) {
        const { category, ...product } = item;
        const categoryRecord = seedCategories.find((entry) => entry.slug === category);
        addProduct.run({ ...product, slug: item.id.replace(/^prd-/, ''), category_id: categoryRecord.id, sizes: JSON.stringify(item.sizes), colors: JSON.stringify(item.colors), tenant_id: DEFAULT_TENANT_ID });
      }
    })();
  }
  db.exec('CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id)');
  if (adminAccount?.email && adminAccount?.password) {
    if (adminAccount.password.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters.');
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminAccount.email.toLowerCase());
    if (!admin) db.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)')
      .run('seed-admin', 'Administración Atelier', adminAccount.email.toLowerCase(), bcrypt.hashSync(adminAccount.password, 12), 'admin');
    membershipInsert.run(DEFAULT_TENANT_ID, admin?.id || 'seed-admin', 'owner');
  }
  if (process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD) {
    if (process.env.SUPERADMIN_PASSWORD.length < 16) throw new Error('SUPERADMIN_PASSWORD must contain at least 16 characters.');
    const email = process.env.SUPERADMIN_EMAIL.toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) db.prepare('UPDATE users SET platform_role=? WHERE id=?').run('superadmin', existing.id);
    else db.prepare('INSERT INTO users (id,name,email,password_hash,role,platform_role) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), 'Administración de plataforma', email, bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD, 12), 'customer', 'superadmin');
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
