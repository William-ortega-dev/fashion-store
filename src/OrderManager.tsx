import { useEffect, useState } from 'react';
import { api, money } from './api';
import { useAuth } from './store';
import type { Order } from './types';

export function OrderManager() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function refresh() { setOrders(await api<Order[]>('/api/admin/orders')); }
  useEffect(() => { refresh().catch((err: Error) => setError(err.message)); }, []);
  async function updateStatus(order: Order, status: 'processing' | 'shipped') {
    setError(''); setNotice('');
    try { await api('/api/admin/orders/' + order.id, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice('Estado del pedido ' + order.id.slice(0, 8).toUpperCase() + ' actualizado.'); await refresh(); }
    catch (err) { setError((err as Error).message); }
  }
  const canManage = Boolean(user?.permissions?.includes('orders.manage'));
  return <section className="orders-manager"><div className="admin-section-heading"><div><span className="eyebrow">PEDIDOS DE ESTA TIENDA</span><h2>Órdenes</h2></div><span>Últimos {orders.length} pedidos</span></div>{notice && <p className="notice success-notice">{notice}</p>}{error && <p className="notice error-notice" role="alert">{error}</p>}
    {orders.map((order) => <article className="managed-order" key={order.id}><div className="managed-order-head"><div><span className="eyebrow">{order.id.slice(0, 8).toUpperCase()} · {new Date(order.createdAt).toLocaleDateString('es-CO')}</span><strong>{order.shipping.name}</strong><small>{order.shipping.email} · {order.shipping.city}</small></div><div className="managed-order-status"><span className={'order-status status-' + order.status}>{order.status === 'confirmed' ? 'Confirmado' : order.status === 'processing' ? 'En preparación' : 'Enviado'}</span>{canManage && order.status !== 'shipped' && <button className="text-link" onClick={() => updateStatus(order, order.status === 'confirmed' ? 'processing' : 'shipped')}>{order.status === 'confirmed' ? 'Preparar pedido' : 'Marcar enviado'} ↗</button>}</div></div><div className="managed-order-items">{order.items.map((item, i) => <span key={`${item.productId}-${i}`}>{item.name} × {item.quantity} · {item.size} / {item.color}</span>)}</div><div className="managed-order-foot"><span>{order.shipping.address}</span><strong>{money(order.total)}</strong><small>{order.paymentId} · demostración</small></div></article>)}
    {!orders.length && <div className="empty-state"><h3>Aún no hay pedidos.</h3><p>Las compras de demostración de esta tienda aparecerán aquí.</p></div>}
  </section>;
}
