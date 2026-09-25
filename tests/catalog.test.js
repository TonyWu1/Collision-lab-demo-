import test from 'node:test';
import assert from 'node:assert/strict';
import { getProduct, listProducts } from '../src/catalog.js';

test('getProduct returns null for unknown id', () => {
  assert.equal(getProduct('missing'), null);
});

test('getProduct returns a product with the new price object shape', () => {
  const p = getProduct('p1');
  assert.equal(p.id, 'p1');
  assert.equal(p.name, 'Widget');
  assert.equal(typeof p.price, 'object');
  assert.equal(p.price.amount, 20);
  assert.equal(p.price.currency, 'USD');
});

test('listProducts returns all products', () => {
  const all = listProducts();
  assert.equal(all.length, 3);
  assert.ok(all.every((p) => typeof p.price === 'object' && 'amount' in p.price));
});
