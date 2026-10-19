import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { api, money } from './api';
import { useAuth, useCart } from './store';
import type { Category, Product } from './types';
import { AccountPage, CartPage, CheckoutPage, OrderPage, ProductPage } from './Pages';
import { AdminPage } from './Admin';

function Header() {
  const { user } = useAuth();
  const { count } = useCart();
  return <>
    <div className="announcement">Hecho con intención. Envío gratis desde $350.000 COP</div>
    <header className="site-header">
      <NavLink className="brand" to="/" aria-label="Atelier N°8, inicio"><span className="brand-word">ATELIER</span><span className="brand-mark">N°8</span></NavLink>
      <nav className="main-nav"><NavLink to="/coleccion">Colección</NavLink><a href="/#filosofia">Nuestra filosofía</a><NavLink to="/coleccion?category=tejidos">Tejidos</NavLink></nav>
      <div className="header-actions">
        <Link className="icon-action" to="/cuenta" aria-label="Mi cuenta"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg><span>{user ? user.name.split(' ')[0] : 'Entrar'}</span></Link>
        <Link className="icon-action" to="/carrito" aria-label={'Bolsa, ' + count + ' productos'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16l-1.2 13H5.2L4 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg><span>Bolsa</span><span className="cart-count">{count}</span></Link>
      </div>
    </header>
  </>;
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main">
    <div><Link className="brand footer-brand" to="/"><span className="brand-word">ATELIER</span><span className="brand-mark">N°8</span></Link><p>Vestir con intención.<br />Vivir con ligereza.</p></div>
    <div><b>Explora</b><Link to="/coleccion">Colección</Link><a href="/#filosofia">Nuestra filosofía</a></div>
    <div><b>Atención</b><a href="mailto:hola@ateliern8.co">hola@ateliern8.co</a><span>Lunes a viernes · 9:00–17:00</span></div>
    <div><b>Síguenos</b><a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram ↗</a><span>Bogotá, Colombia</span></div>
  </div><div className="footer-bottom"><span>© 2026 Atelier N°8</span><span>Diseñado para durar, pensado para repetir.</span><Link to="/admin">Administración</Link></div></footer>;
}

function Layout() {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  return <><Header /><main><Outlet /></main><Footer /></>;
}

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  return <article className="product-card" style={{ animationDelay: index * 45 + 'ms' }}>
    <Link className="product-image-wrap" to={'/producto/' + product.slug}><img src={product.image} alt={product.name} loading="lazy" />{product.featured && <span className="product-label">Favorito</span>}{product.stock < 1 && <span className="product-label sold-out-label">Agotado</span>}</Link>
    <div className="product-card-copy"><div><Link className="product-name" to={'/producto/' + product.slug}>{product.name}</Link><span className="product-subtitle">{product.subtitle}</span></div><span className="product-price">{money(product.price)}</span></div>
    <div className="product-card-meta"><span>{product.categoryName}</span><span>{product.colors.join(' · ')}</span></div>
  </article>;
}

export function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) return <div className="empty-state"><span className="empty-symbol">○</span><h3>No encontramos prendas</h3><p>Prueba cambiar la búsqueda o los filtros.</p></div>;
  return <div className="product-grid">{products.map((product, i) => <ProductCard key={product.id} product={product} index={i} />)}</div>;
}

function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { Promise.all([api<Product[]>('/api/products?featured=true'), api<Category[]>('/api/categories')]).then(([items, groups]) => { setProducts(items); setCategories(groups); }).catch((err: Error) => setError(err.message)); }, []);
  return <div>
    <section className="hero"><img className="hero-image" src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2200&q=90" alt="Una mujer recorre una calle al atardecer con prendas de silueta relajada" /><div className="hero-shade" /><div className="hero-copy"><span className="eyebrow light-eyebrow">COLECCIÓN 01 · 2026</span><h1>Menos piezas.<br /><em>Más vida.</em></h1><p>Prendas que se sienten bien hoy,<br />y siguen teniendo sentido mañana.</p><Link className="button button-ivory" to="/coleccion">Descubre la colección <span>↗</span></Link></div><span className="hero-index">01 / 04</span><span className="hero-caption">Bogotá · Hecho para quedarse</span></section>
    <section className="intro-strip"><span className="eyebrow">VESTIR CON INTENCIÓN</span><p>Una mirada más pausada al armario.<br /><em>Texturas honestas, formas que perduran.</em></p><span className="intro-seal">N°<br />08</span></section>
    <section className="section-block featured-section"><div className="section-heading"><div><span className="eyebrow">LA EDICIÓN ACTUAL</span><h2>Favoritos de temporada</h2></div><Link className="text-link" to="/coleccion">Ver toda la colección ↗</Link></div>{error ? <p className="notice error-notice">{error}</p> : products.length ? <ProductGrid products={products.slice(0, 4)} /> : <div className="loading-line">Preparando la colección…</div>}</section>
    <section className="category-band"><div className="category-band-copy"><span className="eyebrow">ENCUENTRA TU RITMO</span><h2>Vestir sin<br /><em>esfuerzo.</em></h2><Link className="button button-dark" to="/coleccion">Explorar prendas ↗</Link></div><div className="category-list">{categories.map((category, i) => <Link key={category.id} to={'/coleccion?category=' + category.slug}><span className="category-number">0{i + 1}</span><span>{category.name}</span><span>↗</span></Link>)}</div><img src="https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=1100&q=85" alt="Detalles de prendas en tonos tierra" loading="lazy" /></section>
    <section className="manifesto" id="filosofia"><div className="manifesto-image"><img src="https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=1100&q=85" alt="Texturas naturales y tonos tierra" loading="lazy" /></div><div className="manifesto-copy"><span className="eyebrow">UNA FORMA DE ELEGIR</span><h2>Lo importante<br />es <em>cómo se siente.</em></h2><p>Creemos en comprar menos y elegir mejor. Por eso cada pieza empieza con un material que invita a tocar, una forma que deja moverse y una pregunta sencilla: ¿la querrás usar dentro de cinco años?</p><Link className="text-link" to="/coleccion">Conoce las prendas ↗</Link></div><span className="manifesto-number">08</span></section>
    <section className="newsletter"><span className="eyebrow">MENOS, MEJOR</span><h2>Un armario que<br /><em>se siente como tú.</em></h2><p>Prendas esenciales, materiales honestos y formas que perduran.</p><Link className="text-link" to="/coleccion">Descubre Atelier N°8 ↗</Link></section>
  </div>;
}

function CollectionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState({ category: searchParams.get('category') || '', size: '', color: '', maxPrice: '', sort: 'featured' });
  useEffect(() => { api<Category[]>('/api/categories').then(setCategories).catch((err: Error) => setError(err.message)); }, []);
  useEffect(() => {
    const category = searchParams.get('category') || '';
    const nextQuery = searchParams.get('q') || '';
    setFilters((current) => current.category === category ? current : { ...current, category });
    setQuery((current) => current === nextQuery ? current : nextQuery);
  }, [searchParams]);
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    Object.entries(filters).forEach(([key, value]) => { if (value && value !== 'featured') params.set(key, value); });
    api<Product[]>('/api/products?' + params.toString()).then(setProducts).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [query, filters]);
  const sizes = Array.from(new Set(products.flatMap((product) => product.sizes))).sort();
  const colors = Array.from(new Set(products.flatMap((product) => product.colors))).sort();
  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key === 'category') setSearchParams((current) => { const next = new URLSearchParams(current); value ? next.set('category', value) : next.delete('category'); return next; });
  }
  return <div className="page-container collection-page">
    <div className="collection-top"><span className="eyebrow">ATELIER N°8 · BOGOTÁ</span><h1>La colección</h1><p>Un guardarropa pequeño, con espacio para cada cosa.</p></div>
    <div className="collection-toolbar"><span>{loading ? 'Buscando prendas…' : products.length + ' prendas'}</span><div className="search-form"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></svg><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar una prenda" aria-label="Buscar una prenda" />{query && <button onClick={() => setQuery('')} aria-label="Borrar búsqueda">×</button>}</div><label className="sort-select"><span>Ordenar</span><select value={filters.sort} onChange={(event) => setFilter('sort', event.target.value)}><option value="featured">Destacados</option><option value="newest">Novedades</option><option value="price_asc">Precio: menor a mayor</option><option value="price_desc">Precio: mayor a menor</option></select></label></div>
    <div className="catalog-layout"><aside className="filters">
      <div className="filter-block"><label htmlFor="category-filter">Categoría</label><select id="category-filter" value={filters.category} onChange={(event) => setFilter('category', event.target.value)}><option value="">Todas las prendas</option>{categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></div>
      <div className="filter-block"><label htmlFor="size-filter">Talla</label><select id="size-filter" value={filters.size} onChange={(event) => setFilter('size', event.target.value)}><option value="">Todas las tallas</option>{sizes.map((size) => <option key={size}>{size}</option>)}</select></div>
      <div className="filter-block"><label htmlFor="color-filter">Color</label><select id="color-filter" value={filters.color} onChange={(event) => setFilter('color', event.target.value)}><option value="">Todos los colores</option>{colors.map((color) => <option key={color}>{color}</option>)}</select></div>
      <div className="filter-block"><label htmlFor="price-filter">Precio máximo</label><select id="price-filter" value={filters.maxPrice} onChange={(event) => setFilter('maxPrice', event.target.value)}><option value="">Sin límite</option><option value="150000">Hasta $150.000</option><option value="250000">Hasta $250.000</option><option value="350000">Hasta $350.000</option></select></div>
      <button className="clear-filters" onClick={() => { setQuery(''); setFilters({ category: '', size: '', color: '', maxPrice: '', sort: 'featured' }); setSearchParams({}); }}>Limpiar filtros ↺</button>
    </aside><div className="catalog-results">{error ? <p className="notice error-notice">{error}</p> : loading ? <div className="loading-line">Preparando la colección…</div> : <ProductGrid products={products} />}</div></div>
  </div>;
}

function NotFound() { return <div className="page-container"><div className="empty-state"><span className="empty-symbol">08</span><h2>Este camino no tiene prendas.</h2><p>Quizá el enlace se movió. La colección te espera.</p><Link className="button button-dark" to="/coleccion">Volver a la tienda ↗</Link></div></div>; }

export function App() {
  return <BrowserRouter><Routes><Route element={<Layout />}><Route index element={<HomePage />} /><Route path="coleccion" element={<CollectionPage />} /><Route path="producto/:slug" element={<ProductPage />} /><Route path="carrito" element={<CartPage />} /><Route path="cuenta" element={<AccountPage />} /><Route path="pago" element={<CheckoutPage />} /><Route path="pedido/:id" element={<OrderPage />} /><Route path="admin" element={<AdminPage />} /><Route path="*" element={<NotFound />} /></Route></Routes></BrowserRouter>;
}
