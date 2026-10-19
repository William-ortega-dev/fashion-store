import { afterEach, describe, expect, it } from 'vitest';
import serverless from 'serverless-http';
import { createApp } from '../server/app.js';
import { createStore } from '../server/db.js';

describe('enrutamiento de Netlify Functions', () => {
  let db;
  afterEach(() => db?.close());

  it('dirige /api al punto de entrada de Express', async () => {
    db = createStore(':memory:');
    const app = createApp({ db, sessionSecret: 'local-test-secret-that-is-long-enough', staticDir: null });
    const handler = serverless(app, { basePath: '/.netlify/functions/api' });
    const response = await handler({
      httpMethod: 'GET',
      path: '/.netlify/functions/api/api/health',
      headers: {},
      queryStringParameters: null,
      body: null,
      isBase64Encoded: false,
    }, {});
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });
});
