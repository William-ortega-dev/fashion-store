# Atelier N°8 — tienda de ropa

Tienda de ropa responsive creada como proyecto de portafolio. La experiencia de compra funciona de punta a punta en modo demostración: el servidor valida el pedido, calcula el precio con los datos del catálogo, comprueba el inventario y guarda el pedido en SQLite. No integra pasarelas ni procesa cobros.

## Tecnologías

- **React, TypeScript y Vite:** interfaz modular, accesible y rápida en desarrollo.
- **Node.js y Express:** API REST y entrega de la aplicación compilada desde el mismo servidor.
- **SQLite con better-sqlite3:** persistencia local sencilla, transacciones para pedidos e inventario.
- **Zod:** validación de registros, pedidos y operaciones administrativas.
- **bcryptjs y JWT en cookie HttpOnly:** contraseñas cifradas y sesión con autorización por rol.
- **Vitest y Supertest:** pruebas de rutas, autenticación, catálogo, inventario y checkout.

## Requisitos

- Node.js 20.19 o posterior (el proyecto se verificó con Node 24).
- npm 10 o posterior.

## Instalación y ejecución

~~~powershell
npm ci
Copy-Item .env.example .env
~~~

Edita `.env` y define:

- `SESSION_SECRET`: valor aleatorio largo. Puedes generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- `ADMIN_EMAIL`: correo para la cuenta administradora de demostración.
- `ADMIN_PASSWORD`: contraseña propia y única de al menos 16 caracteres. No se incluye una contraseña de administrador en el repositorio.

Luego inicia ambos procesos:

~~~powershell
npm run dev
~~~

Abre <http://localhost:5173>. Vite sirve la interfaz y reenvía `/api` a Express en `http://localhost:4000`. La primera ejecución crea `data/fashion-store.db` con categorías y prendas de muestra. El servidor crea la cuenta administradora solo si se definen las dos variables `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

Para ejecutar la versión de producción localmente:

~~~powershell
npm run build
npm start
~~~

Express sirve la aplicación compilada y la API en el puerto indicado por `PORT` (por defecto 4000).

## Funciones

- Inicio editorial, navegación, catálogo y fichas individuales con fotos de producto.
- Búsqueda por texto y filtros de categoría, talla, color, precio máximo y orden.
- Selección de talla y color; carrito persistido en el navegador, con cantidades y totales.
- Registro e inicio de sesión. Las sesiones se guardan en cookies `HttpOnly`, `SameSite=Lax`.
- Checkout de demostración que valida existencias en una transacción SQLite, descuenta inventario y crea una orden con referencia `DEMO-*`. No hay cobros reales.
- Panel `/admin` para altas, ediciones y bajas de productos y categorías, con gestión de stock.
- Diseño adaptable a móviles, tabletas y pantallas grandes.

Las fotos y las fuentes se cargan desde Unsplash y Google Fonts, respectivamente; la primera carga necesita conexión a internet. Los filtros, catálogo, autenticación, carrito y órdenes usan datos propios de esta aplicación.

## Pruebas

~~~powershell
npm test
npm run build
~~~

La suite usa una base SQLite en memoria para comprobar catálogo y filtros, registro/roles, creación de pedidos, descuento de stock y gestión administrativa. No requiere credenciales externas.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto HTTP de Express (4000 por defecto). |
| `DATABASE_PATH` | Archivo SQLite; por defecto `./data/fashion-store.db`. |
| `SESSION_SECRET` | Secreto para firmar sesiones JWT. Obligatorio y único en producción. |
| `ADMIN_EMAIL` | Correo de la cuenta de administrador de demostración. |
| `ADMIN_PASSWORD` | Contraseña inicial de administrador; se almacena cifrada con bcrypt. |
| `NODE_ENV` | Usa `production` al desplegar para activar cookies `Secure`. |

`.env`, archivos de base de datos, dependencias, resultados de compilación y caché npm están excluidos por `.gitignore`. No subas el `.env` ni credenciales al repositorio.

## Despliegue

La aplicación está preparada para desplegarse como **un servicio Node.js** detrás de HTTPS:

1. Conecta el repositorio en un proveedor que admita Node.js 20.19+ y discos persistentes.
2. Configura la instalación con `npm ci`, la compilación con `npm run build` y el comando de inicio con `npm start`.
3. Define `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `DATABASE_PATH`.
4. Monta un disco persistente en la ruta que contiene `DATABASE_PATH` (por ejemplo, `./data/fashion-store.db`) para conservar usuarios, inventario y pedidos entre despliegues.
5. Expón el servicio por HTTPS y establece `PORT` con el puerto que proporcione la plataforma. Express escucha en `0.0.0.0`.
6. Verifica `/api/health`, crea la cuenta administradora con las variables configuradas y realiza un pedido de prueba. El checkout sigue siendo de demostración.

No se necesita una pasarela de pagos ni un servicio de correo. Si se quisiera cobrar pedidos reales, habría que integrar y configurar un proveedor de pagos; este proyecto no recoge ni transmite datos de tarjeta.

## Capturas

Las capturas de pantalla aún no se han generado. Puedes ejecutar `npm run dev` para recorrer la tienda y el panel localmente.
