import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, money } from './api';
import { useAuth, useCart } from './store';
import type { Order, Product } from './types';

export function ProductPage() {
  const { slug = '' } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  useEffect(() => {
    setProduct(null);
    setError('');
    api<Product>('/api/products/' + encodeURIComponent(slug)).then((item) => { setProduct(item); setSize(item.sizes[0]); setColor(item.colors[0]); }).catch((err: Error) => setError(err.message));
  }, [slug]);
  if (error) return <div className="page-container"><div className="empty-state"><h2>{error}</h2><Link className="text-link" to="/coleccion">Volver a la colección ↗</Link></div></div>;
  if (!product) return <div className="page-container loading-line">Preparando tu prenda…</div>;
  return <div className="page-container product-page"><div className="breadcrumbs"><Link to="/">Inicio</Link><span>/</span><Link to="/coleccion">Colección</Link><span>/</span><span>{product.name}</span></div>
    <div className="product-detail"><div className="product-detail-image"><img src={product.image} alt={product.name} /></div><div className="product-detail-copy">
      <span className="eyebrow">{product.categoryName} · ATELIER N°8</span><h1>{product.name}</h1><p className="detail-subtitle">{product.subtitle}</p><span className="detail-price">{money(product.price)}</span><p className="detail-description">{product.description}</p>
      <div className="selection-group"><div className="selection-heading"><span>Color</span><span className="selection-current">{color}</span></div><div className="color-options">{product.colors.map((option, index) => <button type="button" key={option} className={'color-option ' + (color === option ? 'selected' : '')} onClick={() => setColor(option)} aria-label={'Color ' + option} title={option}><span style={{ backgroundColor: ['#d9c7aa', '#383633', '#a57053', '#efebe3', '#72735f', '#506278'][index % 6] }} /></button>)}</div></div>
      <div className="selection-group"><div className="selection-heading"><span>Talla</span><span className="size-guide">Guía de tallas</span></div><div className="size-options">{product.sizes.map((option) => <button type="button" key={option} className={size === option ? 'selected' : ''} onClick={() => setSize(option)}>{option}</button>)}</div></div>
      <button className="button button-dark add-button" disabled={product.stock < 1} onClick={() => { add(product, size, color); setAdded(true); window.setTimeout(() => setAdded(false), 2200); }}>{product.stock < 1 ? 'Agotado' : added ? 'Añadido a tu bolsa ✓' : 'Añadir a la bolsa · ' + money(product.price)}</button>
      <div className="detail-availability">{product.stock > 0 ? <><span className="availability-dot" /> {product.stock < 5 ? 'Quedan pocas unidades' : 'Disponible · Envío en 2–4 días'}</> : 'Sin existencias'}</div>
      <details className="detail-accordion"><summary>Material y cuidado</summary><p>Materiales seleccionados por su tacto y durabilidad. Lavar con cuidado siguiendo las instrucciones de la etiqueta.</p></details>
      <details className="detail-accordion"><summary>Envíos y devoluciones</summary><p>Envío gratuito en compras desde $350.000 COP. Cambios dentro de los 30 días posteriores a la entrega.</p></details>
    </div></div></div>;
}

export function CartPage() {
  const { lines, total, setQuantity, remove } = useCart();
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return <div className="page-container cart-page"><div className="page-title-row"><div><span className="eyebrow">TU SELECCIÓN</span><h1>La bolsa <span>({count})</span></h1></div><Link className="text-link" to="/coleccion">Seguir explorando ↗</Link></div>
    {!lines.length ? <div className="empty-cart"><span className="empty-symbol">○</span><h2>Tu bolsa está en pausa.</h2><p>Cuando encuentres algo que te guste, lo guardaremos aquí.</p><Link to="/coleccion" className="button button-dark">Explorar colección ↗</Link></div> : <div className="cart-layout">
      <div className="cart-items">{lines.map((line) => <article key={line.key} className="cart-line"><Link to={'/producto/' + line.product.slug}><img src={line.product.image} alt={line.product.name} /></Link><div className="cart-line-copy"><Link className="product-name" to={'/producto/' + line.product.slug}>{line.product.name}</Link><span>{line.color} · Talla {line.size}</span><span>{money(line.product.price)}</span><button className="remove-link" onClick={() => remove(line.key)}>Eliminar</button></div><div className="quantity-control"><button onClick={() => setQuantity(line.key, line.quantity - 1)} aria-label="Reducir cantidad">−</button><span>{line.quantity}</span><button onClick={() => setQuantity(line.key, line.quantity + 1)} disabled={line.quantity >= line.product.stock} aria-label="Aumentar cantidad">+</button></div><span className="cart-line-total">{money(line.product.price * line.quantity)}</span></article>)}</div>
      <aside className="order-summary"><span className="eyebrow">RESUMEN</span><div><span>Subtotal</span><span>{money(total)}</span></div><div><span>Envío</span><span>{total >= 350000 ? 'Sin costo' : 'Se calcula al pagar'}</span></div><p>Pedido de demostración. No se realizará ningún cobro.</p><div className="summary-total"><strong>Total</strong><strong>{money(total)}</strong></div><Link to="/pago" className="button button-dark full-button">Continuar al pago ↗</Link><span className="secure-note">Compra de demostración · Sin cobros reales</span></aside>
    </div>}
  </div>;
}

export function Field({ label, value, onChange, type = 'text', placeholder, autoComplete, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; minLength?: number }) {
  const id = 'field-' + label.toLowerCase().replace(/\s/g, '-');
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} required /></label>;
}

function AuthForm() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const destination = params.get('next') || '/cuenta';
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      if (register) await signUp(name, email, password);
      else await signIn(email, password);
      navigate(destination, { replace: true });
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  return <div className="auth-page"><div className="auth-image"><img src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85" alt="Estilo contemporáneo en tonos naturales" /><span>Tu armario,<br /><em>a tu manera.</em></span></div><div className="auth-panel"><span className="eyebrow">{register ? 'UNA NUEVA HISTORIA' : 'QUÉ BUENO VERTE'}</span><h1>{register ? 'Crear tu cuenta' : 'Entra a tu espacio'}</h1><p>{register ? 'Guarda tus prendas y sigue tus pedidos.' : 'Ingresa para revisar tus pedidos y completar tu compra.'}</p>
    <form className="form-stack" onSubmit={submit}>{register && <Field label="Nombre" value={name} onChange={setName} autoComplete="name" />}<Field label="Correo electrónico" value={email} onChange={setEmail} type="email" placeholder="nombre@correo.com" autoComplete="email" /><Field label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="Mínimo 8 caracteres" autoComplete={register ? 'new-password' : 'current-password'} minLength={8} />{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark full-button" disabled={loading}>{loading ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Iniciar sesión'} ↗</button></form>
    <p className="auth-switch">{register ? '¿Ya tienes una cuenta?' : '¿Es tu primera visita?'} <button onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Inicia sesión' : 'Crea una cuenta'}</button></p>
    <div className="demo-access"><span>Administración</span><p>Define `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` para habilitar la cuenta administradora.</p><Link to="/admin">Ir al panel de administración ↗</Link></div>
  </div></div>;
}

export function AccountPage() {
  const { user, ready, signOut } = useAuth();
  const navigate = useNavigate();
  if (!ready) return <div className="page-container loading-line">Un momento…</div>;
  if (!user) return <AuthForm />;
  return <div className="page-container account-page"><span className="eyebrow">TU ESPACIO</span><h1>Hola, {user.name.split(' ')[0]}.</h1><p>{user.email}</p>{user.role === 'admin' && <Link className="button button-dark" to="/admin">Abrir administración ↗</Link>}<button className="text-link account-signout" onClick={async () => { await signOut(); navigate('/'); }}>Cerrar sesión ↗</button></div>;
}

export function CheckoutPage() {
  const { user, ready } = useAuth();
  const { lines, total, clear } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shipping, setShipping] = useState({ name: user?.name || '', email: user?.email || '', address: '', city: 'Bogotá' });
  useEffect(() => { if (user) setShipping((current) => ({ ...current, name: user.name, email: user.email })); }, [user]);
  if (!ready) return <div className="page-container loading-line">Un momento…</div>;
  if (!user) return <Navigate to="/cuenta?next=%2Fpago" replace />;
  if (!lines.length) return <Navigate to="/carrito" replace />;
  function change(key: keyof typeof shipping, value: string) { setShipping((current) => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const order = await api<Order>('/api/checkout', { method: 'POST', body: JSON.stringify({ items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, size: line.size, color: line.color })), shipping }) });
      clear(); navigate('/pedido/' + order.id, { state: { order }, replace: true });
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  return <div className="page-container checkout-page"><div className="page-title-row"><div><span className="eyebrow">ÚLTIMO PASO</span><h1>Finalizar pedido</h1></div><span className="demo-chip">COMPRA DE DEMOSTRACIÓN</span></div>
    <div className="checkout-layout"><form className="checkout-form" onSubmit={submit}><h2>Datos de entrega</h2><p>Registraremos estos datos solo con tu pedido de muestra.</p><Field label="Nombre completo" value={shipping.name} onChange={(v) => change('name', v)} autoComplete="name" /><Field label="Correo electrónico" value={shipping.email} onChange={(v) => change('email', v)} type="email" autoComplete="email" /><Field label="Dirección" value={shipping.address} onChange={(v) => change('address', v)} placeholder="Calle, número, apartamento" autoComplete="street-address" /><Field label="Ciudad" value={shipping.city} onChange={(v) => change('city', v)} autoComplete="address-level2" />{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark full-button" disabled={loading}>{loading ? 'Confirmando pedido…' : 'Confirmar compra de demostración'} ↗</button><span className="checkout-disclaimer">No se realizará ningún cobro ni se conectará con una pasarela de pago.</span></form>
      <aside className="order-summary"><span className="eyebrow">TU PEDIDO</span>{lines.map((line) => <div className="checkout-mini" key={line.key}><img src={line.product.image} alt="" /><span>{line.product.name} × {line.quantity}<small>{line.color} · {line.size}</small></span><strong>{money(line.product.price * line.quantity)}</strong></div>)}<div className="summary-total"><strong>Total</strong><strong>{money(total)}</strong></div></aside>
    </div>
  </div>;
}

export function OrderPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState<Order | null>(location.state?.order || null);
  const [error, setError] = useState('');
  useEffect(() => { if (!order) api<Order>('/api/orders/' + encodeURIComponent(id)).then(setOrder).catch((err: Error) => setError(err.message)); }, [id, order]);
  if (error) return <div className="page-container"><div className="empty-state"><h2>{error}</h2></div></div>;
  if (!order) return <div className="page-container loading-line">Confirmando tu pedido…</div>;
  return <div className="order-confirmation"><div className="confirmation-check">✓</div><span className="eyebrow">PEDIDO CONFIRMADO · DEMO</span><h1>Gracias por elegir<br /><em>con intención.</em></h1><p>Tu pedido de demostración quedó registrado. No se hizo ningún cobro.</p><div className="confirmation-receipt"><div><span>Número de pedido</span><strong>{order.id.slice(0, 8).toUpperCase()}</strong></div><div><span>Referencia demo</span><strong>{order.paymentId}</strong></div><div><span>Entrega</span><strong>{order.shipping.address}, {order.shipping.city}</strong></div><div><span>Total del pedido</span><strong>{money(order.total)}</strong></div></div><Link to="/coleccion" className="button button-dark">Volver a la colección ↗</Link></div>;
}
