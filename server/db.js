import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';

const seedCategories = [
  { id: 'cat-tops', name: 'Tops', slug: 'tops' },
  { id: 'cat-pants', name: 'Pantalones', slug: 'pantalones' },
  { id: 'cat-dresses', name: 'Vestidos', slug: 'vestidos' },
  { id: 'cat-knitwear', name: 'Tejidos', slug: 'tejidos' },
  { id: 'cat-accessories', name: 'Accesorios', slug: 'accesorios' },
];

const seedProducts = [
  { id: 'prd-linen-shirt', name: 'Camisa de lino', subtitle: 'La calma de lo esencial', category: 'tops', description: 'Camisa de lino europeo de fibra larga, confeccionada en una silueta relajada. Ligera, transpirable y hecha para acompañarte temporada tras temporada.', price: 189000, image: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=1100&q=85', sizes: ['XS', 'S', 'M', 'L'], colors: ['Marfil', 'Arena'], stock: 18, featured: 1 },
  { id: 'prd-wide-trouser', name: 'Pantalón fluido', subtitle: 'Movimiento natural', category: 'pantalones', description: 'Tiro alto, caída amplia y una cintura que se adapta con suavidad. Una pieza versátil que transita de la mañana a la noche.', price: 229000, image: 'https://images.unsplash.com/photo-1506629905607-d9c297d588e0?auto=format&fit=crop&w=1100&q=85', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Negro', 'Piedra'], stock: 12, featured: 1 },
  { id: 'prd-sculpted-dress', name: 'Vestido escultórico', subtitle: 'Una forma de estar', category: 'vestidos', description: 'Un vestido midi de líneas limpias, construido en algodón con estructura suave. El corte define sin limitar.', price: 289000, image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=1100&q=85', sizes: ['XS', 'S', 'M', 'L'], colors: ['Terracota', 'Negro'], stock: 9, featured: 1 },
  { id: 'prd-soft-knit', name: 'Tejido esencial', subtitle: 'Textura que abriga', category: 'tejidos', description: 'Tejido ligero de tacto sedoso con una mezcla responsable de algodón y fibras recicladas. Suave por dentro y por fuera.', price: 259000, image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1100&q=85', sizes: ['S', 'M', 'L', 'XL'], colors: ['Oliva', 'Hueso'], stock: 15, featured: 1 },
  { id: 'prd-cotton-top', name: 'Top de algodón', subtitle: 'Menos, mejor', category: 'tops', description: 'Jersey de algodón orgánico, escote redondo y ajuste relajado. El básico al que siempre vuelves.', price: 119000, image: 'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=1100&q=85', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Blanco', 'Chocolate'], stock: 22, featured: 0 },
  { id: 'prd-denim', name: 'Denim recto', subtitle: 'El ajuste perfecto', category: 'pantalones', description: 'Denim de algodón con lavado de bajo impacto. Un corte recto, tiro medio y una vida larga por delante.', price: 249000, image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=1100&q=85', sizes: ['26', '28', '30', '32', '34'], colors: ['Índigo'], stock: 14, featured: 0 },
  { id: 'prd-wrap-dress', name: 'Vestido cruzado', subtitle: 'Ligereza en capas', category: 'vestidos', description: 'Vestido cruzado en viscosa de origen responsable, con lazo ajustable y mangas fluidas.', price: 319000, image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1100&q=85', sizes: ['XS', 'S', 'M', 'L'], colors: ['Azul humo', 'Vino'], stock: 7, featured: 0 },
  { id: 'prd-tote', name: 'Bolso de lona', subtitle: 'Todo lo que importa', category: 'accesorios', description: 'Lona gruesa de algodón reciclado, asas cómodas y un bolsillo interior para lo imprescindible.', price: 99000, image: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1100&q=85', sizes: ['Única'], colors: ['Crudo', 'Negro'], stock: 20, featured: 0 },
  { id: 'prd-overshirt', name: 'Sobrecamisa utilitaria', subtitle: 'Capas con carácter', category: 'tops', description: 'Sobrecamisa de algodón compacto con botones naturales y bolsillos de parche. Una capa ligera para todos los días.', price: 279000, image: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=1100&q=85', sizes: ['S', 'M', 'L', 'XL'], colors: ['Caramelo', 'Verde bosque'], stock: 11, featured: 0 },
];

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
  return db;
}

export function mapProduct(row) {
  if (!row) return row;
  const { sizes, colors, featured, category_id, ...rest } = row;
  return { ...rest, sizes: JSON.parse(sizes), colors: JSON.parse(colors), featured: Boolean(featured), categoryId: category_id };
}
