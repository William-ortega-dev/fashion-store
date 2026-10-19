import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Field } from './Pages';

type CreatedStore = { tenant: { slug: string }; url: string };

export function CreateStorePage() {
  const [form, setForm] = useState({ name: '', slug: '', ownerName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await api<CreatedStore>('/api/stores', { method: 'POST', body: JSON.stringify(form) });
      window.location.assign(result.url + 'admin');
    } catch (err) { setError((err as Error).message); setLoading(false); }
  }
  return <div className="onboarding-page">
    <div className="onboarding-aside"><span className="eyebrow light-eyebrow">TU MARCA, TU ESPACIO</span><h1>Una tienda<br /><em>hecha a tu manera.</em></h1><p>Crea tu escaparate y configura la experiencia de tu marca desde un mismo lugar.</p><span className="onboarding-seal">A<br />N°8</span></div>
    <div className="onboarding-form-wrap"><Link to="/" className="text-link onboarding-back">← Atelier N°8</Link><span className="eyebrow">PLAN ESENCIAL · GRATUITO</span><h2>Abre tu tienda</h2><p>Sin pagos ni tarjeta. Empieza con el catálogo y personaliza tu escaparate.</p>
      <form className="form-stack" onSubmit={submit}>
        <Field label="Nombre de la tienda" value={form.name} onChange={(v) => { update('name', v); if (!form.slug || form.slug === slugify(form.name)) update('slug', slugify(v)); }} />
        <label className="field"><span>Dirección pública</span><div className="slug-input"><span>/tienda/</span><input required minLength={3} maxLength={48} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(e) => update('slug', slugify(e.target.value))} /><span>/</span></div></label>
        <Field label="Tu nombre" value={form.ownerName} onChange={(v) => update('ownerName', v)} autoComplete="name" />
        <Field label="Correo de acceso" value={form.email} onChange={(v) => update('email', v)} type="email" autoComplete="email" />
        <Field label="Contraseña" value={form.password} onChange={(v) => update('password', v)} type="password" minLength={12} autoComplete="new-password" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark full-button" disabled={loading}>{loading ? 'Creando espacio…' : 'Crear mi tienda ↗'}</button>
        <span className="checkout-disclaimer">El plan inicial no procesa pagos recurrentes. El catálogo, el equipo y la personalización se limitan desde el servidor.</span>
      </form>
    </div>
  </div>;
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
