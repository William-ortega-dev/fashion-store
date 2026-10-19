import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { useAuth } from './store';

type Role = { id: string; name: string; permissions: string[]; builtIn: boolean };
type Member = { id: string; name: string; email: string; role: string; roleName: string; custom_role_id: string | null; active: boolean };
const permissionLabels: Record<string, string> = {
  'catalog.read': 'Ver catálogo', 'catalog.manage': 'Editar productos y categorías', 'inventory.manage': 'Actualizar inventario',
  'orders.read': 'Consultar pedidos', 'orders.manage': 'Gestionar pedidos', 'branding.manage': 'Editar la tienda',
  'team.manage': 'Gestionar equipo', 'roles.manage': 'Gestionar roles',
};
const baseRoles = [
  { id: 'admin', name: 'admin' }, { id: 'seller', name: 'seller' },
  { id: 'inventory_manager', name: 'inventory_manager' }, { id: 'order_manager', name: 'order_manager' },
];

export function TeamRolesManager({ mode }: { mode: 'team' | 'roles' }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [memberRole, setMemberRole] = useState('seller');
  const [roleName, setRoleName] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['catalog.read']);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const canManageRoles = Boolean(user?.permissions?.includes('roles.manage'));
  async function refresh() {
    if (mode === 'team') setMembers(await api<Member[]>('/api/admin/team'));
    if (mode === 'roles' || canManageRoles) setRoles(await api<Role[]>('/api/admin/roles'));
  }
  useEffect(() => { refresh().catch((err: Error) => setError(err.message)); }, [mode]);
  async function addMember(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setLoading(true);
    try {
      const result = await api<{ message: string }>('/api/admin/team', { method: 'POST', body: JSON.stringify({ name, email, password: password || undefined, role: memberRole }) });
      setNotice(result.message); setName(''); setEmail(''); setPassword(''); await refresh();
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  async function changeRole(member: Member, role: string) {
    setError(''); setNotice('');
    try { await api('/api/admin/team/' + member.id, { method: 'PUT', body: JSON.stringify({ role }) }); setNotice('Permisos de ' + member.name + ' actualizados.'); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  async function removeMember(member: Member) {
    if (!window.confirm('¿Retirar a ' + member.name + ' de esta tienda?')) return;
    try { await api('/api/admin/team/' + member.id, { method: 'DELETE' }); setNotice('Acceso retirado.'); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  async function createRole(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setLoading(true);
    try { await api('/api/admin/roles', { method: 'POST', body: JSON.stringify({ name: roleName, permissions }) }); setRoleName(''); setNotice('Rol personalizado creado.'); await refresh(); }
    catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  async function deleteRole(role: Role) {
    if (!window.confirm('¿Eliminar el rol ' + role.name + '?')) return;
    try { await api('/api/admin/roles/' + role.id, { method: 'DELETE' }); setNotice('Rol eliminado.'); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  return <div className="team-manager">
    {notice && <p className="notice success-notice" role="status">{notice}</p>}{error && <p className="notice error-notice" role="alert">{error}</p>}
    {mode === 'team' ? <div className="team-layout"><form className="team-form" onSubmit={addMember}><span className="eyebrow">NUEVO ACCESO</span><h2>Añadir integrante</h2><p>El acceso se crea en esta tienda y usa el mismo correo en toda la plataforma. Si ya tiene cuenta, deja la contraseña vacía.</p><label className="field"><span>Nombre</span><input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field"><span>Correo</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="field"><span>Contraseña inicial (si es una cuenta nueva)</span><input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><label className="field"><span>Rol</span><select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>{baseRoles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}{roles.filter((role) => !role.builtIn).map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label><button className="button button-dark" disabled={loading}>{loading ? 'Guardando…' : 'Dar acceso ↗'}</button></form>
      <section className="team-list"><div className="admin-section-heading"><div><span className="eyebrow">PERMISOS POR TIENDA</span><h2>Equipo</h2></div><span>{members.filter((m) => m.active).length} integrantes</span></div>{members.map((member) => <div className="team-row" key={member.id}><div><strong>{member.name}</strong><small>{member.email}{member.role === 'owner' ? ' · propietario' : ''}</small></div>{member.role === 'owner' ? <span className="team-role-lock">Propietario</span> : <><select aria-label={'Rol de ' + member.name} value={member.custom_role_id || member.role} onChange={(e) => changeRole(member, e.target.value)}>{baseRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}{roles.filter((role) => !role.builtIn).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><button className="team-remove" onClick={() => removeMember(member)}>Retirar</button></>}</div>)}{!members.length && <p>No hay integrantes.</p>}<p className="field-hint">Las sesiones consultan el rol vigente en cada solicitud. Desactivar un integrante revoca su acceso a esta tienda.</p></section></div>
      : <div className="roles-layout"><form className="team-form role-form" onSubmit={createRole}><span className="eyebrow">PERMISOS DETALLADOS</span><h2>Crear un rol</h2><label className="field"><span>Nombre</span><input required minLength={3} maxLength={40} value={roleName} onChange={(e) => setRoleName(e.target.value)} /></label><div className="permission-checks">{Object.entries(permissionLabels).map(([permission, label]) => <label key={permission}><input type="checkbox" checked={permissions.includes(permission)} onChange={(e) => setPermissions((items) => e.target.checked ? [...items, permission] : items.filter((item) => item !== permission))} /><span>{label}</span></label>)}</div><button className="button button-dark" disabled={loading || !permissions.length}>{loading ? 'Guardando…' : 'Crear rol ↗'}</button></form><section className="roles-list"><span className="eyebrow">CATÁLOGO DE ROLES</span>{roles.map((role) => <article key={role.id} className="role-card"><div><strong>{role.name}</strong>{role.builtIn && <small>Incluido</small>}</div><p>{role.permissions.map((permission) => permissionLabels[permission] || permission).join(' · ') || 'Sin permisos'}</p>{!role.builtIn && <button className="team-remove" onClick={() => deleteRole(role)}>Eliminar rol</button>}</article>)}</section></div>}
  </div>;
}
