export type User = { id: string; name: string; email: string; role: 'customer' | 'admin' };
export type Category = { id: string; name: string; slug: string };
export type Product = {
  id: string;
  name: string;
  subtitle: string;
  slug: string;
  categoryId: string;
  categoryName?: string;
  categorySlug?: string;
  description: string;
  price: number;
  image: string;
  sizes: string[];
  colors: string[];
  stock: number;
  featured: boolean;
};
export type CartLine = { key: string; product: Product; size: string; color: string; quantity: number };
export type OrderItem = { productId: string; name: string; price: number; quantity: number; size: string; color: string };
export type Order = {
  id: string;
  status: string;
  total: number;
  items: OrderItem[];
  shipping: { name: string; email: string; address: string; city: string };
  paymentId: string;
  createdAt: string;
};
