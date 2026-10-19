import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { seedCategories, seedProducts } from './catalog-seed.js';
import { DEFAULT_BRAND, DEFAULT_PLANS, DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from './tenant-model.js';

export function compileQuery(sql, values) {
  if (!values.length) return { sql, values };
  if (values.length === 1 && !Array.isArray(values[0]) && values[0] && typeof values[0] === 'object') {
    const named = values[0];
    const names = Object.keys(named);
    return {
      sql: sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name) => {
        const index = names.indexOf(name);
        if (index < 0) throw new Error('Missing SQL parameter: ' + name);
        return '$' + (index + 1);
      }),
      values: names.map((name) => named[name]),
    };
  }
  const positional = values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  let index = 0;
  return { sql: sql.replace(/\?/g, () => '$' + (++index)), values: positional };
}

function databaseAdapter(query, transaction = false) {
  return {
    prepare(sql) {
      const execute = async (values) => {
        const compiled = compileQuery(sql, values);
        return query(compiled.sql, compiled.values);
      };
      return {
        async get(...values) { return (await execute(values)).rows[0]; },
        async all(...values) { return (await execute(values)).rows; },
        async run(...values) { const result = await execute(values); return { changes: result.rowCount }; },
      };
    },
    transaction(callback) {
      if (!transaction) throw new Error('Transactions are unavailable on this database adapter.');
      return (...args) => transaction((tx) => callback(tx, ...args));
    },
  };
}

const schema = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE, category_id TEXT NOT NULL REFERENCES categories(id),
    description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0),
    image TEXT NOT NULL, sizes TEXT NOT NULL, colors TEXT NOT NULL,
    stock INTEGER NOT NULL CHECK(stock >= 0), featured INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'confirmed', total INTEGER NOT NULL,
    items_json TEXT NOT NULL, shipping_json TEXT NOT NULL, demo_payment_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
  CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id);
`;

const tenantSchema = `
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;
  ALTER TABLE products DROP CONSTRAINT IF EXISTS products_slug_key;
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, max_products INTEGER NOT NULL, max_members INTEGER NOT NULL,
    allowed_templates JSONB NOT NULL, custom_fonts BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
    plan_id TEXT NOT NULL REFERENCES plans(id), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id), plan_id TEXT NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'trialing', provider TEXT, started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS tenant_memberships (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL, custom_role_id TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(tenant_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS tenant_roles (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL, permissions_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id,name)
  );
  CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    draft_json JSONB NOT NULL, published_json JSONB NOT NULL, updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS store_assets (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,storage_key)
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_slug_idx ON categories(tenant_id,slug);
  CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_slug_idx ON products(tenant_id,slug);
  CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id,category_id);
  CREATE INDEX IF NOT EXISTS orders_tenant_idx ON orders(tenant_id,user_id);
  CREATE INDEX IF NOT EXISTS memberships_user_idx ON tenant_memberships(user_id,tenant_id);
`;

export async function createPostgresStore({ connectionString = process.env.NETLIFY_DB_URL, adminAccount = {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
} } = {}) {
  if (!connectionString) throw new Error('NETLIFY_DB_URL is required to connect to PostgreSQL.');
  const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
  const query = (sql, values = []) => pool.query(sql, values);
  const run = async (client, sql, values = []) => {
    const compiled = compileQuery(sql, values);
    return client.query(compiled.sql, compiled.values);
  };
  try {
    await query(schema);
    await query(tenantSchema);
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');
      for (const plan of DEFAULT_PLANS) {
        await run(seedClient, 'INSERT INTO plans (id,name,max_products,max_members,allowed_templates,custom_fonts) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING', [
          plan.id, plan.name, plan.maxProducts, plan.maxMembers, JSON.stringify(plan.allowedTemplates), plan.customFonts,
        ]);
      }
      await run(seedClient, 'INSERT INTO tenants (id,name,slug,plan_id) VALUES (?,?,?,?) ON CONFLICT (id) DO NOTHING', [DEFAULT_TENANT_ID, 'Atelier N°8', DEFAULT_TENANT_SLUG, 'pro']);
      await run(seedClient, 'UPDATE categories SET tenant_id=? WHERE tenant_id IS NULL', [DEFAULT_TENANT_ID]);
      await run(seedClient, 'UPDATE products SET tenant_id=? WHERE tenant_id IS NULL', [DEFAULT_TENANT_ID]);
      await run(seedClient, 'UPDATE orders SET tenant_id=? WHERE tenant_id IS NULL', [DEFAULT_TENANT_ID]);
      await run(seedClient, 'INSERT INTO subscriptions (id,tenant_id,plan_id,status,provider) VALUES (?,?,?, ?,NULL) ON CONFLICT (tenant_id) DO NOTHING', ['subscription-atelier-n8', DEFAULT_TENANT_ID, 'pro', 'active']);
      await run(seedClient, 'INSERT INTO tenant_settings (tenant_id,draft_json,published_json) VALUES (?,?,?) ON CONFLICT (tenant_id) DO NOTHING', [DEFAULT_TENANT_ID, JSON.stringify(DEFAULT_BRAND), JSON.stringify(DEFAULT_BRAND)]);
      for (const category of seedCategories) {
        await run(seedClient, 'INSERT INTO categories (id,name,slug,tenant_id) VALUES (?,?,?,?) ON CONFLICT (id) DO NOTHING', [category.id, category.name, category.slug, DEFAULT_TENANT_ID]);
      }
      for (const item of seedProducts) {
        const { category, ...product } = item;
        const categoryRecord = seedCategories.find((entry) => entry.slug === category);
        await run(seedClient, 'INSERT INTO products (id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured,tenant_id) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING', [
          product.id, product.name, product.subtitle, item.id.replace(/^prd-/, ''), categoryRecord.id,
          product.description, product.price, product.image, JSON.stringify(product.sizes), JSON.stringify(product.colors), product.stock, product.featured, DEFAULT_TENANT_ID,
        ]);
      }
      if (adminAccount?.email && adminAccount?.password) {
        if (adminAccount.password.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters.');
        await run(seedClient, 'INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?) ON CONFLICT (email) DO NOTHING', [
          'seed-admin', 'Administración Atelier', adminAccount.email.toLowerCase(), bcrypt.hashSync(adminAccount.password, 12), 'admin',
        ]);
        await run(seedClient, 'INSERT INTO tenant_memberships (tenant_id,user_id,role) SELECT ?,id,\'owner\' FROM users WHERE email=? ON CONFLICT (tenant_id,user_id) DO NOTHING', [DEFAULT_TENANT_ID, adminAccount.email.toLowerCase()]);
      }
      if (process.env.SUPERADMIN_EMAIL && process.env.SUPERADMIN_PASSWORD) {
        if (process.env.SUPERADMIN_PASSWORD.length < 16) throw new Error('SUPERADMIN_PASSWORD must contain at least 16 characters.');
        const email = process.env.SUPERADMIN_EMAIL.toLowerCase();
        await run(seedClient, 'INSERT INTO users (id,name,email,password_hash,role,platform_role) VALUES (?,?,?,?,?,?) ON CONFLICT (email) DO UPDATE SET platform_role=EXCLUDED.platform_role', [
          randomUUID(), 'Administración de plataforma', email, bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD, 12), 'customer', 'superadmin',
        ]);
      }
      await run(seedClient, 'INSERT INTO tenant_memberships (tenant_id,user_id,role) SELECT ?,id,\'owner\' FROM users WHERE role=\'admin\' ON CONFLICT (tenant_id,user_id) DO NOTHING', [DEFAULT_TENANT_ID]);
      await seedClient.query('COMMIT');
    } catch (error) {
      await seedClient.query('ROLLBACK');
      throw error;
    } finally {
      seedClient.release();
    }
  } catch (error) {
    await pool.end();
    throw error;
  }
  const adapter = databaseAdapter(query, async (callback) => {
    const client = await pool.connect();
    const tx = databaseAdapter((sql, values = []) => run(client, sql, values));
    try {
      await client.query('BEGIN');
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  return Object.assign(adapter, { close: () => pool.end() });
}
