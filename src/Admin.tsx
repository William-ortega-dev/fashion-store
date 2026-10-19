import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, money } from './api';
import { Field } from './Pages';
import { useAuth } from './store';
import type { Category, Product } from './types';

type Draft = { name: string; subtitle: string; categoryId: string; description: string; price: string; image: string; sizes: string; colors: string; stock: string; featured: boolean };
const emptyDraft: Draft = { name: '', subtitle: '', categoryId: '', description: '', price: '', image: '', sizes: 'XS, S, M, L', colors: 'Marfil, Negro', stock: '0', featured: false };

export function AdminPage() {
  const { user, ready } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: '', slug: '' });
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function refresh() {
    const [items, groups] = await Promise.all([api<Product[]>('/api/admin/products'), api<Category[]>('/api/categories')]);
    setProducts(items); setCategories(groups);
  }
  useEffect(() => { if (ready && user?.role === 'admin') refresh().catch((err: Error) => setError(err.message)); }, [ready, user]);
  if (!ready) return <div className="page-container loading-line">Un momento…</div>;
  if (!user) return <Navigate to="/cuenta?next=%2Fadmin" replace />;
  if (user.role !== 'admin') return <div className="page-container"><div className="empty-state"><h2>Acceso solo para administración.</h2><Link className="text-link" to="/">Volver a la tienda ↗</Link></div></div>;

  function editProduct(product: Product) {
    setEditingProduct(product.id);
    setDraft({ name: product.name, subtitle: product.subtitle, categoryId: product.categoryId, description: product.description, price: String(product.price), image: product.image, sizes: product.sizes.join(', '), colors: product.colors.join(', '), stock: String(product.stock), featured: product.featured });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function submitProduct(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    const payload = { ...draft, price: Number(draft.price), stock: Number(draft.stock), sizes: draft.sizes.split(',').map((v) => v.trim()).filter(Boolean), colors: draft.colors.split(',').map((v) => v.trim()).filter(Boolean) };
    try {
      await api('/api/admin/products' + (editingProduct ? '/' + editingProduct : ''), { method: editingProduct ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setNotice(editingProduct ? 'Cambios guardados.' : 'Producto creado.');
      setDraft(emptyDraft); setEditingProduct(null); await refresh();
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  async function removeProduct(id: string) {
    if (!window.confirm('¿Eliminar esta prenda del catálogo?')) return;
    try { await api('/api/admin/products/' + id, { method: 'DELETE' }); setNotice('Producto eliminado.'); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  async function submitCategory(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      await api('/api/admin/categories' + (editingCategory ? '/' + editingCategory : ''), { method: editingCategory ? 'PUT' : 'POST', body: JSON.stringify(categoryDraft) });
      setNotice(editingCategory ? 'Categoría actualizada.' : 'Categoría creada.');
      setCategoryDraft({ name: '', slug: '' }); setEditingCategory(null); await refresh();
    } catch (err) { setError((err as Error).message); }
  }
  async function removeCategory(category: Category) {
    if (!window.confirm('¿Eliminar la categoría ' + category.name + '?')) return;
    try { await api('/api/admin/categories/' + category.id, { method: 'DELETE' }); setNotice('Categoría eliminada.'); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  return <div className="admin-page">
    <div className="admin-top"><div><span className="eyebrow">ATELIER N°8 · ESPACIO INTERNO</span><h1>Administración</h1><p>Hola, {user.name}. Gestiona el catálogo y el inventario.</p></div><Link className="text-link" to="/">← Volver a la tienda</Link></div>
    <div className="admin-stats"><div><span>Productos</span><strong>{String(products.length).padStart(2, '0')}</strong></div><div><span>Categorías</span><strong>{String(categories.length).padStart(2, '0')}</strong></div><div><span>Unidades disponibles</span><strong>{String(products.reduce((sum, product) => sum + product.stock, 0)).padStart(2, '0')}</strong></div></div>
    <div className="admin-tabs"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Productos e inventario</button><button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>Categorías</button></div>
    {notice && <p className="notice success-notice" role="status">{notice}</p>}{error && <p className="notice error-notice" role="alert">{error}</p>}
    {tab === 'products' ? <div className="admin-product-layout">
      <form className="admin-form" onSubmit={submitProduct}><span className="eyebrow">{editingProduct ? 'EDITAR PRENDA' : 'NUEVA PRENDA'}</span><h2>{editingProduct ? 'Editar producto' : 'Añadir al catálogo'}</h2>
        <Field label="Nombre" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
        <Field label="Frase corta" value={draft.subtitle} onChange={(v) => setDraft({ ...draft, subtitle: v })} />
        <label className="field"><span>Categoría</span><select required value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Seleccionar</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field"><span>Descripción</span><textarea required minLength={10} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={4} /></label>
        <div className="field-pair"><Field label="Precio (COP)" value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} type="number" /><Field label="Unidades" value={draft.stock} onChange={(v) => setDraft({ ...draft, stock: v })} type="number" /></div>
        <Field label="URL de la imagen" value={draft.image} onChange={(v) => setDraft({ ...draft, image: v })} type="url" placeholder="https://…" />
        <Field label="Tallas · separadas por coma" value={draft.sizes} onChange={(v) => setDraft({ ...draft, sizes: v })} />
        <Field label="Colores · separados por coma" value={draft.colors} onChange={(v) => setDraft({ ...draft, colors: v })} />
        <label className="checkbox-field"><input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /> Destacar en inicio</label>
        <button className="button button-dark full-button" disabled={saving}>{saving ? 'Guardando…' : editingProduct ? 'Guardar cambios' : 'Crear producto'} ↗</button>
        {editingProduct && <button className="cancel-edit" type="button" onClick={() => { setEditingProduct(null); setDraft(emptyDraft); }}>Cancelar edición</button>}
      </form>
      <div className="inventory-panel"><div className="admin-section-heading"><div><span className="eyebrow">CATÁLOGO ACTUAL</span><h2>Inventario</h2></div><span>{products.length} referencias</span></div>
        <div className="inventory-table"><div className="inventory-head"><span>Prenda</span><span>Categoría</span><span>Precio</span><span>Stock</span><span>Acciones</span></div>{products.map((product) => <div className="inventory-row" key={product.id}><div className="inventory-item"><img src={product.image} alt="" /><span>{product.name}<small>{product.sizes.join(' · ')}</small></span></div><span className="inventory-category">{product.categoryName}</span><span>{money(product.price)}</span><span className={product.stock < 5 ? 'low-stock' : ''}>{product.stock}</span><div className="inventory-actions"><button onClick={() => editProduct(product)}>Editar</button><button onClick={() => removeProduct(product.id)} aria-label={'Eliminar ' + product.name}>×</button></div></div>)}</div>
      </div>
    </div> : <div className="category-admin">
      <form className="category-form" onSubmit={submitCategory}><span className="eyebrow">{editingCategory ? 'EDITAR CATEGORÍA' : 'NUEVA CATEGORÍA'}</span><h2>{editingCategory ? 'Actualizar categoría' : 'Crear categoría'}</h2>
        <Field label="Nombre" value={categoryDraft.name} onChange={(v) => { const slug = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); setCategoryDraft({ name: v, slug }); }} />
        <Field label="URL" value={categoryDraft.slug} onChange={(v) => setCategoryDraft({ ...categoryDraft, slug: v })} />
        <button className="button button-dark" type="submit">{editingCategory ? 'Guardar' : 'Crear categoría'} ↗</button>
        {editingCategory && <button className="cancel-edit" type="button" onClick={() => { setEditingCategory(null); setCategoryDraft({ name: '', slug: '' }); }}>Cancelar</button>}
      </form>
      <div className="category-admin-list"><span className="eyebrow">CATEGORÍAS ACTIVAS</span>{categories.map((category) => <div key={category.id}><span>{category.name}<small>/{category.slug}</small></span><div><button onClick={() => { setEditingCategory(category.id); setCategoryDraft({ name: category.name, slug: category.slug }); }}>Editar</button><button onClick={() => removeCategory(category)} aria-label={'Eliminar categoría ' + category.name}>×</button></div></div>)}</div>
    </div>}
  </div>;
}
