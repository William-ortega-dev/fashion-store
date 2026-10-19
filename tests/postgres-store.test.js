import { describe, expect, it } from 'vitest';
import { compileQuery } from '../server/postgres-store.js';

describe('adaptador PostgreSQL', () => {
  it('convierte placeholders posicionales sin interpolar valores', () => {
    expect(compileQuery('SELECT * FROM products WHERE id = ? AND stock >= ?', ['prd-1', 3])).toEqual({
      sql: 'SELECT * FROM products WHERE id = $1 AND stock >= $2',
      values: ['prd-1', 3],
    });
  });

  it('conserva el vínculo entre placeholders con nombre y valores', () => {
    expect(compileQuery('INSERT INTO products (id,name,slug) VALUES (@id,@name,@slug)', [{ slug: 'camisa', id: 'prd-1', name: 'Camisa' }])).toEqual({
      sql: 'INSERT INTO products (id,name,slug) VALUES ($2,$3,$1)',
      values: ['camisa', 'prd-1', 'Camisa'],
    });
  });
});
