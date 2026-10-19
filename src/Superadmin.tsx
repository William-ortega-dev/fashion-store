import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './store';

type Tenant = { id: string; name: string; slug: string; status: 'active' | 'suspended'; plan_id: string; plan_name: string; products: number; members: number; created_at: string };
type Plan = { id: string; name: string; max_products: number; max_members: number; allowed_templates: string[]; custom_fonts: boolean; active: boolean };
const templates = ['minimal', 'editorial', 'urbano', 'moderno', 'clasico'];

export function SuperadminPage() {
  const { user, ready } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [newPlan, setNewPlan] = useState({ id: '', name: '', maxProducts: 50, maxMembers: 3, allowedTemplates: ['minimal'], customFonts: false });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function refresh() {
    const [stores, availablePlans] = await Promise.all([api<Tenant[]>('/api/platform/tenants'), api<Plan[]>('/api/platform/plans')]);
    setTenants(stores); setPlans(availablePlans);
  }
  useEffect(() => { if (ready && user?.role === 'superadmin') refresh().catch((err: Error) => setError(err.message)); }, [ready, user]);
  if (!ready) return <div className="page-container loading-line">Un momento…</div>;
  if (!user) return <Navigate to="/cuenta?next=%2Fsuperadmin" replace />;
  if (user.role !== 'superadmin') return <div className="page-container"><div className="empty-state"><h2>Este panel es exclusivo de plataforma.</h2><Link to="/" className="text-link">Volver a la tienda ↗</Link></div></div>;
  async function updateTenant(tenant: Tenant, changes: { status?: string; planId?: string }) {
    setError(''); setNotice('');
    try { await api('/api/platform/tenants/' + tenant.id, { method: 'PATCH', body: JSON.stringify(changes) }); setNotice('Cambios guardados para ' + tenant.name + '.'); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  async function savePlan(event: FormEvent, plan: Plan) {
    event.preventDefault(); setError(''); setNotice('');
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const allowedTemplates = form.getAll('template').map(String);
    try {
      await api('/api/platform/plans/' + plan.id, { method: 'PUT', body: JSON.stringify({ name: String(form.get('name')), maxProducts: Number(form.get('maxProducts')), maxMembers: Number(form.get('maxMembers')), allowedTemplates, customFonts: form.get('customFonts') === 'on', active: form.get('active') === 'on' }) });
      setNotice('Plan ' + plan.name + ' actualizado.'); await refresh();
    } catch (err) { setError((err as Error).message); }
  }
  async function createPlan(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try { await api('/api/platform/plans', { method: 'POST', body: JSON.stringify(newPlan) }); setNotice('Plan creado.'); setNewPlan({ id: '', name: '', maxProducts: 50, maxMembers: 3, allowedTemplates: ['minimal'], customFonts: false }); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  return <div className="admin-page platform-page"><div className="admin-top"><div><span className="eyebrow">CONTROL DE PLATAFORMA</span><h1>Tiendas</h1><p>Gestiona planes y estado de acceso de cada tenant.</p></div><Link to="/" className="text-link">← Volver a la tienda</Link></div>
    <div className="admin-stats"><div><span>Tiendas</span><strong>{String(tenants.length).padStart(2, '0')}</strong></div><div><span>Activas</span><strong>{String(tenants.filter((t) => t.status === 'active').length).padStart(2, '0')}</strong></div><div><span>Planes</span><strong>{String(plans.length).padStart(2, '0')}</strong></div></div>
    {notice && <p className="notice success-notice">{notice}</p>}{error && <p className="notice error-notice" role="alert">{error}</p>}
    <div className="platform-table"><div className="platform-head"><span>Tienda</span><span>Miembros</span><span>Productos</span><span>Plan</span><span>Estado</span></div>{tenants.map((tenant) => <div className="platform-row" key={tenant.id}><span><strong>{tenant.name}</strong><small><a href={'/tienda/' + tenant.slug + '/'} target="_blank" rel="noreferrer">/tienda/{tenant.slug} ↗</a></small></span><span>{tenant.members}</span><span>{tenant.products}</span><select aria-label={'Plan de ' + tenant.name} value={tenant.plan_id} onChange={(e) => updateTenant(tenant, { planId: e.target.value })}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.max_products} productos</option>)}</select><button className="text-link" onClick={() => updateTenant(tenant, { status: tenant.status === 'active' ? 'suspended' : 'active' })}>{tenant.status === 'active' ? 'Suspender' : 'Reactivar'}</button></div>)}</div>
    {!tenants.length && <div className="empty-state"><p>No hay tiendas registradas.</p></div>}
    <section className="platform-plans"><div className="admin-section-heading"><div><span className="eyebrow">CUOTAS Y CAPACIDADES</span><h2>Planes</h2></div><span>No hay cobro recurrente conectado</span></div><div className="plan-editor-list">{plans.map((plan) => <form className="plan-editor-row" key={plan.id} onSubmit={(event) => savePlan(event, plan)}><div className="plan-editor-title"><strong>{plan.name}</strong><small>{plan.id}</small></div><label>Nombre<input name="name" defaultValue={plan.name} required minLength={2} maxLength={60} /></label><label>Productos<input name="maxProducts" type="number" min="1" max="100000" defaultValue={plan.max_products} required /></label><label>Miembros<input name="maxMembers" type="number" min="1" max="10000" defaultValue={plan.max_members} required /></label><div className="plan-template-checks">{templates.map((template) => <label key={template}><input type="checkbox" name="template" value={template} defaultChecked={plan.allowed_templates.includes(template)} />{template}</label>)}</div><div className="plan-feature-checks"><label><input type="checkbox" name="customFonts" defaultChecked={plan.custom_fonts} /> Fuentes</label><label><input type="checkbox" name="active" defaultChecked={plan.active} /> Activo</label></div><button className="button button-dark">Guardar plan</button></form>)}</div>
      <form className="plan-create-form" onSubmit={createPlan}><span className="eyebrow">NUEVA CONFIGURACIÓN</span><label>ID <input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={newPlan.id} onChange={(e) => setNewPlan({ ...newPlan, id: e.target.value.toLowerCase() })} placeholder="studio-plus" /></label><label>Nombre <input required value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} /></label><label>Máx. productos <input type="number" min="1" value={newPlan.maxProducts} onChange={(e) => setNewPlan({ ...newPlan, maxProducts: Number(e.target.value) })} /></label><label>Máx. miembros <input type="number" min="1" value={newPlan.maxMembers} onChange={(e) => setNewPlan({ ...newPlan, maxMembers: Number(e.target.value) })} /></label><div>{templates.map((template) => <label key={template}><input type="checkbox" checked={newPlan.allowedTemplates.includes(template)} onChange={(e) => setNewPlan({ ...newPlan, allowedTemplates: e.target.checked ? [...newPlan.allowedTemplates, template] : newPlan.allowedTemplates.filter((item) => item !== template) })} />{template}</label>)}</div><button className="button button-dark">Crear plan ↗</button></form>
    </section>
  </div>;
}
