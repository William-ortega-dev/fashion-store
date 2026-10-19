import { getConnectionString } from '@netlify/database';
import { withLambda } from '@netlify/aws-lambda-compat';
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

async function handler(event, context) {
  return (await getHandler())(event, context);
}

// Run the Express/Lambda adapter on Netlify's modern Functions runtime so
// platform primitives such as Netlify Database are available automatically.
export default withLambda(handler);
