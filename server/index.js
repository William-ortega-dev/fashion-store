import 'dotenv/config';
import { createServer } from 'node:http';
import { createStore } from './db.js';
import { createApp } from './app.js';

const db = createStore();
const app = createApp({ db });
const port = Number(process.env.PORT || 4000);
const server = createServer(app);
server.listen(port, '0.0.0.0', () => {
  console.log('Atelier N°8 API lista en http://localhost:' + port);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
