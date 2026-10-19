# Atelier N°8 — tienda de ropa

Tienda de ropa responsive creada como proyecto de portafolio. La experiencia de compra funciona de punta a punta en modo demostración: el servidor valida el pedido, calcula el precio con los datos del catálogo, comprueba el inventario dentro de una transacción y guarda el pedido. En local usa SQLite; en Netlify usa PostgreSQL administrado. No integra pasarelas ni procesa cobros.

## Tecnologías

- **React, TypeScript y Vite:** interfaz modular, accesible y rápida en desarrollo.
- **Node.js y Express:** API REST y entrega de la aplicación compilada desde el mismo servidor.
- **SQLite con better-sqlite3 y PostgreSQL con `pg`:** SQLite liviano para desarrollo y pruebas; PostgreSQL persistente para Netlify Functions.
- **Netlify Database:** PostgreSQL administrado con migraciones versionadas y conexión inyectada como variable de entorno.
- **Zod:** validación de registros, pedidos y operaciones administrativas.
- **bcryptjs y JWT en cookie HttpOnly:** contraseñas cifradas y sesión con autorización por rol.
- **Vitest y Supertest:** pruebas de rutas, autenticación, catálogo, inventario y checkout.

## Requisitos

- Node.js 22.12 o posterior (requisito del adaptador moderno de Netlify Functions; verificado con Node 24).
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
- Checkout de demostración que valida existencias en una transacción, descuenta inventario de forma atómica y crea una orden con referencia `DEMO-*`. No hay cobros reales.
- Panel `/admin` para altas, ediciones y bajas de productos y categorías, con gestión de stock.
- Diseño adaptable a móviles, tabletas y pantallas grandes.

Las fotos y las fuentes se cargan desde Unsplash y Google Fonts, respectivamente; la primera carga necesita conexión a internet. Los filtros, catálogo, autenticación, carrito y órdenes usan datos propios de esta aplicación.

## Pruebas

~~~powershell
npm test
npm run build
~~~

La suite usa SQLite en memoria para comprobar catálogo y filtros, registro/roles, creación de pedidos, descuento de stock y gestión administrativa. También valida el adaptador de parámetros PostgreSQL y el enrutamiento de la función de Netlify. No requiere credenciales externas.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto HTTP de Express (4000 por defecto). |
| `DATABASE_PATH` | Archivo SQLite; por defecto `./data/fashion-store.db`. |
| `NETLIFY_DB_URL` | Netlify Database la inyecta en las funciones al vincular una base PostgreSQL. No la configures manualmente ni la publiques. |
| `SESSION_SECRET` | Secreto para firmar sesiones JWT. Obligatorio y único en producción. |
| `ADMIN_EMAIL` | Correo de la cuenta de administrador de demostración. |
| `ADMIN_PASSWORD` | Contraseña inicial de administrador; se almacena cifrada con bcrypt. |
| `NODE_ENV` | Usa `production` al desplegar para activar cookies `Secure`. |

`.env`, archivos de base de datos, dependencias, resultados de compilación y caché npm están excluidos por `.gitignore`. No subas el `.env` ni credenciales al repositorio.

## Despliegue gratuito en Netlify

El repositorio incluye `netlify.toml`, una función Express para `/api/*` y una migración PostgreSQL. Netlify publica `dist` en su CDN y ejecuta la API en Functions; Netlify Database conserva las cuentas, los pedidos y el inventario entre ejecuciones. El proyecto sigue usando SQLite al ejecutarse localmente.

1. Importa `William-ortega-dev/fashion-store` en Netlify y selecciona un equipo **Free**. El comando de compilación (`npm run build`), directorio (`dist`), función y reescritura API ya están configurados.
2. En el proyecto, crea una base en **Data & Storage → Database**. Con `@netlify/database` instalado, Netlify aplica las migraciones de `netlify/database/migrations` durante el despliegue e inyecta `NETLIFY_DB_URL` en la función.
3. En **Site configuration → Environment variables**, define `NODE_ENV=production`, un `SESSION_SECRET` aleatorio (32 bytes o más), `ADMIN_EMAIL` y un `ADMIN_PASSWORD` propio de al menos 16 caracteres. No guardes esos valores en Git.
4. Publica el despliegue. En la primera solicitud de API se insertan las categorías y prendas de muestra y se crea la cuenta administradora si las dos variables de administrador están configuradas.
5. Verifica `https://<tu-sitio>.netlify.app/api/health`, inicia sesión en `/admin` y realiza un pedido de prueba. El checkout no cobra dinero.

La capa gratuita actual tiene un límite de **300 créditos mensuales con tope rígido** y no activa cobros automáticos; al agotarlo, Netlify pausa los proyectos hasta el siguiente período. La base de datos tiene además límites de cómputo, transferencia y almacenamiento. Consulta [precios de Netlify](https://www.netlify.com/pricing/) y [límites de Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/) antes de usarla con tráfico real, porque estos planes pueden cambiar.

Para probar la API localmente, usa `npm run dev` (SQLite); para probar las funciones y la base PostgreSQL emulada de Netlify, instala/inicia sesión en Netlify CLI y ejecuta `netlify dev`. Las fotos y fuentes externas requieren conexión a internet.

No se necesita una pasarela de pagos ni un servicio de correo. Si se quisiera cobrar pedidos reales, habría que integrar y configurar un proveedor de pagos; este proyecto no recoge ni transmite datos de tarjeta.

## Capturas

Las capturas de pantalla aún no se han generado. Puedes ejecutar `npm run dev` para recorrer la tienda y el panel localmente.
