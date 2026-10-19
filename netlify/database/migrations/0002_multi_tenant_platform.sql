-- Additive SaaS foundation. Existing Atelier N°8 rows are assigned to the
-- default tenant so the current public storefront remains unchanged.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_products INTEGER NOT NULL,
  max_members INTEGER NOT NULL,
  allowed_templates JSONB NOT NULL,
  custom_fonts BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO plans (id,name,max_products,max_members,allowed_templates,custom_fonts)
VALUES
  ('basic','Esencial',25,2,'["minimal","editorial"]'::jsonb,FALSE),
  ('pro','Estudio',500,10,'["minimal","editorial","urbano","moderno","clasico"]'::jsonb,TRUE),
  ('enterprise','Atelier',10000,50,'["minimal","editorial","urbano","moderno","clasico"]'::jsonb,TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants (id,name,slug,plan_id)
VALUES ('tenant-atelier-n8','Atelier N°8','atelier-n8','pro')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'trialing',
  provider TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  custom_role_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE IF NOT EXISTS tenant_roles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id,name)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  draft_json JSONB NOT NULL,
  published_json JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id,storage_key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE categories SET tenant_id='tenant-atelier-n8' WHERE tenant_id IS NULL;
UPDATE products SET tenant_id='tenant-atelier-n8' WHERE tenant_id IS NULL;
UPDATE orders SET tenant_id='tenant-atelier-n8' WHERE tenant_id IS NULL;

INSERT INTO subscriptions (id,tenant_id,plan_id,status,provider)
VALUES ('subscription-atelier-n8','tenant-atelier-n8','pro','active',NULL)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id,draft_json,published_json)
VALUES (
  'tenant-atelier-n8',
  '{"template":"minimal","brandName":"Atelier N°8","tagline":"Vestir con intención. Vivir con ligereza.","primaryColor":"#34352e","accentColor":"#a58c6b","backgroundColor":"#f8f7f2","textColor":"#292923","headingFont":"Cormorant Garamond","bodyFont":"DM Sans","heroImage":"https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2200&q=90","heroTitle":"Menos piezas. Más vida.","heroSubtitle":"Prendas que se sienten bien hoy, y siguen teniendo sentido mañana.","logoUrl":"","contactEmail":"hola@ateliern8.co"}'::jsonb,
  '{"template":"minimal","brandName":"Atelier N°8","tagline":"Vestir con intención. Vivir con ligereza.","primaryColor":"#34352e","accentColor":"#a58c6b","backgroundColor":"#f8f7f2","textColor":"#292923","headingFont":"Cormorant Garamond","bodyFont":"DM Sans","heroImage":"https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2200&q=90","heroTitle":"Menos piezas. Más vida.","heroSubtitle":"Prendas que se sienten bien hoy, y siguen teniendo sentido mañana.","logoUrl":"","contactEmail":"hola@ateliern8.co"}'::jsonb
)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_memberships (tenant_id,user_id,role)
SELECT 'tenant-atelier-n8',id,'owner' FROM users WHERE role='admin'
ON CONFLICT (tenant_id,user_id) DO NOTHING;

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_slug_idx ON categories(tenant_id,slug);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_slug_idx ON products(tenant_id,slug);
CREATE INDEX IF NOT EXISTS products_tenant_idx ON products(tenant_id,category_id);
CREATE INDEX IF NOT EXISTS orders_tenant_idx ON orders(tenant_id,user_id);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON tenant_memberships(user_id,tenant_id);
