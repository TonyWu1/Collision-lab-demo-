import test from 'node:test';
import assert from 'node:assert/strict';
import { createCart } from '../src/cart.js';

// Baseline catalog shapes (numeric price, as main defines them).
const widget  = { id: 'p1', name: 'Widget',  price: 20 };
const gadget  = { id: 'p2', name: 'Gadget',  price: 45 };
const doohick = { id: 'p3', name: 'Doohick', price: 8  };

test('empty cart has zero total', () => {
  const cart = createCart();
  assert.equal(cart.getTotal(), 0);
});

test('addItem increases total by price × quantity', () => {
  const cart = createCart();
  cart.addItem(widget, 2);
  assert.equal(cart.getTotal(), 40);
});

test('multiple distinct products sum correctly', () => {
  const cart = createCart();
  cart.addItem(widget, 1);   // 20
  cart.addItem(gadget, 2);   // 90
  assert.equal(cart.getTotal(), 110);
});

test('addItem on existing product accumulates quantity', () => {
  const cart = createCart();
  cart.addItem(doohick, 3);
  cart.addItem(doohick, 2);
  assert.equal(cart.getTotal(), 40); // 8 × 5
});

test('removeItem brings total back to zero', () => {
  const cart = createCart();
  cart.addItem(widget, 1);
  cart.removeItem('p1');
  assert.equal(cart.getTotal(), 0);
  assert.equal(cart.getItems().length, 0);
});
