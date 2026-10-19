import { getConnectionString } from '@netlify/database';
import serverless from 'serverless-http';
import { createApp } from '../../server/app.js';
import { createPostgresStore } from '../../server/postgres-store.js';

let initialized;

async function getHandler() {
  if (!initialized) {
    initialized = (async () => {
      const db = await createPostgresStore({ connectionString: getConnectionString() });
      const app = createApp({ db, staticDir: null });
      return serverless(app, { basePath: '/.netlify/functions/api' });
    })().catch((error) => {
      initialized = undefined;
      throw error;
    });
  }
  return initialized;
}

export async function handler(event, context) {
  return (await getHandler())(event, context);
}
