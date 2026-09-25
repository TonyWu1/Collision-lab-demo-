// Integration test: price-cart collision
//
// feature/price-object changed catalog prices to {amount, currency} objects.
// feature/cart implemented getTotal() assuming price is a plain number.
// Both branches pass their unit tests in isolation. After merging, the cart
// computes `product.price * quantity` where product.price is now an object,
// producing NaN instead of a numeric total.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getProduct } from '../src/catalog.js';
import { createCart } from '../src/cart.js';

test('COLLISION: cart total is NaN when catalog returns price objects', () => {
  const widget = getProduct('p1');    // price is now { amount: 20, currency: 'USD' }
  const cart = createCart();
  cart.addItem(widget, 2);

  const total = cart.getTotal();

  // This assertion FAILS after merging: total is NaN, not 40.
  // The numeric-price assumption in cart.js is violated by the object-price
  // change in catalog.js. Git saw no textual conflict — the files are in
  // different modules — so the broken contract was silently introduced.
  assert.equal(total, 40,
    `Expected numeric total 40 but got ${total} — cart.getTotal() multiplied an object price, yielding NaN`);
});

test('COLLISION evidence: getTotal returns NaN with object prices', () => {
  const gadget = getProduct('p2');    // price: { amount: 45, currency: 'USD' }
  const cart = createCart();
  cart.addItem(gadget, 1);

  const total = cart.getTotal();

  // Confirm the root cause: object × number = NaN
  assert.ok(Number.isNaN(total),
    `Expected NaN from object-price multiplication but got ${total}`);
});
