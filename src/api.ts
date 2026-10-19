export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tenantSlug = window.location.pathname.match(/^\/tienda\/([^/]+)/)?.[1];
  const requestUrl = new URL(path, window.location.origin);
  if (tenantSlug && requestUrl.pathname.startsWith('/api/')) requestUrl.searchParams.set('store', decodeURIComponent(tenantSlug));
  const response = await fetch(requestUrl.pathname + requestUrl.search, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No pudimos completar la solicitud.');
  return data as T;
}

export const money = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
