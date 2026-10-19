import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { seedCategories, seedProducts } from './catalog-seed.js';

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
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');
      for (const category of seedCategories) {
        await run(seedClient, 'INSERT INTO categories (id,name,slug) VALUES (?,?,?) ON CONFLICT (id) DO NOTHING', [category.id, category.name, category.slug]);
      }
      for (const item of seedProducts) {
        const { category, ...product } = item;
        const categoryRecord = seedCategories.find((entry) => entry.slug === category);
        await run(seedClient, 'INSERT INTO products (id,name,subtitle,slug,category_id,description,price,image,sizes,colors,stock,featured) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING', [
          product.id, product.name, product.subtitle, item.id.replace(/^prd-/, ''), categoryRecord.id,
          product.description, product.price, product.image, JSON.stringify(product.sizes), JSON.stringify(product.colors), product.stock, product.featured,
        ]);
      }
      if (adminAccount?.email && adminAccount?.password) {
        if (adminAccount.password.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters.');
        await run(seedClient, 'INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?) ON CONFLICT (email) DO NOTHING', [
          'seed-admin', 'Administración Atelier', adminAccount.email.toLowerCase(), bcrypt.hashSync(adminAccount.password, 12), 'admin',
        ]);
      }
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
