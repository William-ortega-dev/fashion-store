import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { CartLine, Product, User } from './types';

type AuthState = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
};
type CartState = {
  lines: CartLine[];
  count: number;
  total: number;
  add: (product: Product, size: string, color: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const CartContext = createContext<CartState | null>(null);
const cartStorageKey = (() => {
  const tenantSlug = window.location.pathname.match(/^\/tienda\/([^/]+)/)?.[1];
  return tenantSlug ? `atelier-cart:${decodeURIComponent(tenantSlug)}` : 'atelier-cart';
})();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<{ user: User }>('/api/auth/me').then(({ user: current }) => setUser(current)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);
  const value = useMemo<AuthState>(() => ({
    user,
    ready,
    async signIn(email, password) {
      const result = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setUser(result.user);
      return result.user;
    },
    async signUp(name, email, password) {
      const result = await api<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
      setUser(result.user);
      return result.user;
    },
    async signOut() {
      await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
    },
  }), [user, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem(cartStorageKey) || '[]') as CartLine[]; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(cartStorageKey, JSON.stringify(lines)); }, [lines]);
  const value = useMemo<CartState>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    total: lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    add(product, size, color) {
      const key = [product.id, size, color].join(':');
      setLines((current) => {
        const existing = current.find((line) => line.key === key);
        if (existing) return current.map((line) => line.key === key ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) } : line);
        return [...current, { key, product, size, color, quantity: 1 }];
      });
    },
    setQuantity(key, quantity) {
      setLines((current) => current.map((line) => line.key === key
        ? { ...line, quantity: Math.max(1, Math.min(quantity, line.product.stock)) }
        : line));
    },
    remove(key) { setLines((current) => current.filter((line) => line.key !== key)); },
    clear() { setLines([]); },
  }), [lines]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe usarse dentro de CartProvider');
  return context;
}
