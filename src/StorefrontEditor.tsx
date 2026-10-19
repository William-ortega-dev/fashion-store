import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from './api';
import type { StorefrontBrand } from './types';

type EditorResponse = { draft: StorefrontBrand; published: StorefrontBrand; plan: { id: string; name: string; allowedTemplates: StorefrontBrand['template'][]; customFonts: boolean } };
type UploadResponse = { url: string };
const templates: { id: StorefrontBrand['template']; name: string; description: string }[] = [
  { id: 'minimal', name: 'Esencial', description: 'Aire, materiales y una jerarquía serena.' },
  { id: 'editorial', name: 'Editorial', description: 'Composición de revista y fotografía protagonista.' },
  { id: 'urbano', name: 'Urbano', description: 'Contraste intenso y ritmo gráfico.' },
  { id: 'moderno', name: 'Moderno', description: 'Bloques asimétricos y lectura contemporánea.' },
  { id: 'clasico', name: 'Clásico', description: 'Marco tradicional, simetría y detalle.' },
];
const standardFonts = ['Cormorant Garamond', 'DM Sans', 'Arial', 'Georgia'];
const studioFonts = [...standardFonts, 'Playfair Display', 'Lora', 'Merriweather', 'Montserrat'];

export function StorefrontEditor() {
  const [draft, setDraft] = useState<StorefrontBrand | null>(null);
  const [published, setPublished] = useState<StorefrontBrand | null>(null);
  const [allowedTemplates, setAllowedTemplates] = useState<StorefrontBrand['template'][]>([]);
  const [customFonts, setCustomFonts] = useState(false);
  const [planName, setPlanName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<EditorResponse>('/api/admin/storefront').then((data) => { setDraft(data.draft); setPublished(data.published); setAllowedTemplates(data.plan.allowedTemplates); setCustomFonts(data.plan.customFonts); setPlanName(data.plan.name); }).catch((err: Error) => setError(err.message));
  }, []);
  function change<K extends keyof StorefrontBrand>(key: K, value: StorefrontBrand[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }
  async function upload(key: 'heroImage' | 'logoUrl', file?: File) {
    if (!file || !draft) return;
    setError(''); setNotice('Subiendo imagen…');
    try {
      const result = await api<UploadResponse>('/api/admin/assets', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      change(key, result.url);
      setNotice('Imagen guardada en el espacio privado de esta tienda.');
    } catch (err) { setError((err as Error).message); setNotice(''); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    setError(''); setNotice(''); setSaving(true);
    try { const result = await api<{ draft: StorefrontBrand; message: string }>('/api/admin/storefront', { method: 'PUT', body: JSON.stringify(draft) }); setDraft(result.draft); setNotice(result.message); }
    catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  async function publish() {
    setError(''); setNotice(''); setSaving(true);
    try { const result = await api<{ brand: StorefrontBrand; message: string }>('/api/admin/storefront/publish', { method: 'POST', body: '{}' }); setPublished(result.brand); setNotice(result.message); }
    catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  async function reset() {
    if (!window.confirm('¿Volver el borrador a la configuración inicial?')) return;
    try { const result = await api<{ draft: StorefrontBrand }>('/api/admin/storefront/reset-draft', { method: 'POST', body: '{}' }); setDraft(result.draft); setNotice('Borrador restablecido. Guarda para conservarlo.'); }
    catch (err) { setError((err as Error).message); }
  }
  if (!draft) return <div className="loading-line">Cargando el editor de marca…</div>;
  const previewStyle = { '--paper': draft.backgroundColor, '--ink': draft.textColor, '--brand-primary': draft.primaryColor, '--brand-accent': draft.accentColor, '--serif': `'${draft.headingFont}', Georgia, serif`, '--body-font': `'${draft.bodyFont}', Arial, sans-serif` } as CSSProperties;
  return <div className="store-editor">
    <div className="editor-intro"><div><span className="eyebrow">IDENTIDAD DE MARCA</span><h2>Tu escaparate</h2><p>Previsualiza el borrador, guarda cuando estés listo y publícalo en un paso separado.</p></div><span className="editor-plan">Plan actual · {planName}</span></div>
    {notice && <p className="notice success-notice" role="status">{notice}</p>}{error && <p className="notice error-notice" role="alert">{error}</p>}
    <form className="store-editor-grid" onSubmit={save}>
      <div className="store-editor-controls">
        <section className="editor-section"><span className="eyebrow">01 · EXPERIENCIA</span><div className="template-options">{templates.map((template) => <label className={'template-option ' + (draft.template === template.id ? 'selected' : '') + (!allowedTemplates.includes(template.id) ? ' locked' : '')} key={template.id}><input type="radio" name="template" value={template.id} checked={draft.template === template.id} disabled={!allowedTemplates.includes(template.id)} onChange={() => change('template', template.id)} /><span className={'template-swatch swatch-' + template.id}><i /><i /><i /></span><strong>{template.name}{!allowedTemplates.includes(template.id) && <small> · Estudio</small>}</strong><small>{template.description}</small></label>)}</div></section>
        <section className="editor-section"><span className="eyebrow">02 · IDENTIDAD</span><div className="field-pair"><label className="field"><span>Color principal</span><div className="color-picker"><input type="color" value={draft.primaryColor} onChange={(e) => change('primaryColor', e.target.value)} /><code>{draft.primaryColor}</code></div></label><label className="field"><span>Color de acento</span><div className="color-picker"><input type="color" value={draft.accentColor} onChange={(e) => change('accentColor', e.target.value)} /><code>{draft.accentColor}</code></div></label></div>
          <div className="field-pair"><label className="field"><span>Fondo</span><div className="color-picker"><input type="color" value={draft.backgroundColor} onChange={(e) => change('backgroundColor', e.target.value)} /><code>{draft.backgroundColor}</code></div></label><label className="field"><span>Texto</span><div className="color-picker"><input type="color" value={draft.textColor} onChange={(e) => change('textColor', e.target.value)} /><code>{draft.textColor}</code></div></label></div>
          <label className="field"><span>Nombre visible</span><input required minLength={2} maxLength={80} value={draft.brandName} onChange={(e) => change('brandName', e.target.value)} /></label>
          <label className="field"><span>Frase de marca</span><input maxLength={160} value={draft.tagline} onChange={(e) => change('tagline', e.target.value)} /></label>
          <div className="field-pair"><label className="field"><span>Tipografía de títulos</span><select value={draft.headingFont} onChange={(e) => change('headingFont', e.target.value)}>{(customFonts ? studioFonts : standardFonts).map((font) => <option key={font}>{font}</option>)}</select></label><label className="field"><span>Tipografía de texto</span><select value={draft.bodyFont} onChange={(e) => change('bodyFont', e.target.value)}>{(customFonts ? studioFonts : standardFonts).map((font) => <option key={font}>{font}</option>)}</select></label></div>
          {!customFonts && <small className="field-hint">Más familias tipográficas están disponibles en el plan Estudio.</small>}
        </section>
        <section className="editor-section"><span className="eyebrow">03 · IMÁGENES Y MENSAJE</span><label className="field"><span>Fotografía principal</span><input value={draft.heroImage} onChange={(e) => change('heroImage', e.target.value)} placeholder="https://…" /></label><label className="field upload-field"><span>Subir fotografía JPG, PNG o WebP · máx. 2 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload('heroImage', e.target.files?.[0])} /></label><div className="field-pair"><label className="field"><span>Título principal</span><input maxLength={120} value={draft.heroTitle} onChange={(e) => change('heroTitle', e.target.value)} /></label><label className="field"><span>Correo de atención</span><input type="email" value={draft.contactEmail} onChange={(e) => change('contactEmail', e.target.value)} /></label></div><label className="field"><span>Texto de portada</span><textarea rows={3} maxLength={240} value={draft.heroSubtitle} onChange={(e) => change('heroSubtitle', e.target.value)} /></label><label className="field"><span>Logo (opcional)</span><input value={draft.logoUrl} onChange={(e) => change('logoUrl', e.target.value)} placeholder="https://…" /></label><label className="field upload-field"><span>Subir logotipo · máx. 2 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload('logoUrl', e.target.files?.[0])} /></label></section>
        <div className="editor-actions"><button className="button button-dark" disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador ↗'}</button><button type="button" className="button button-publish" disabled={saving} onClick={publish}>Publicar tienda</button><button type="button" className="cancel-edit" onClick={reset}>Restablecer</button></div>
      </div>
      <aside className={'brand-preview theme-home-' + draft.template} style={previewStyle}><div className="preview-top"><span className="eyebrow">VISTA PREVIA · BORRADOR</span><span className="preview-state">{JSON.stringify(draft) === JSON.stringify(published) ? 'Publicado' : 'Sin publicar'}</span></div><div className="preview-browser"><div className="preview-browser-bar"><i /><i /><i /><span>{draft.brandName.toLowerCase().replace(/\s+/g, '')}.co</span></div><div className="preview-store"><header>{draft.logoUrl ? <img src={draft.logoUrl} alt="Logo" /> : <strong>{draft.brandName}</strong>}<nav>CATÁLOGO　 NOSOTROS　 CONTACTO</nav></header><div className="preview-hero" style={{ backgroundImage: `linear-gradient(90deg,rgba(20,20,18,.38),rgba(20,20,18,.05)),url("${draft.heroImage}")` }}><span>{draft.brandName.toUpperCase()}</span><h3>{draft.heroTitle}</h3><p>{draft.heroSubtitle}</p><b>Explorar colección ↗</b></div><div className="preview-products"><span>SELECCIÓN ACTUAL</span><div><i /><i /><i /></div></div></div></div><p className="preview-note">La tienda pública conserva la última versión publicada hasta que guardes y pulses “Publicar tienda”.</p></aside>
    </form>
  </div>;
}
