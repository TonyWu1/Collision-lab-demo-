// Generated behavioral test: feature/price-object-v2 × feature/cart
// Tests externally observable behavior of the cart when given catalog products.
// Control A (price-object-v2 only): cart.js is absent — test skips gracefully.
// Control B (cart only): catalog returns numeric prices — getTotal() is finite.
// Combined: catalog returns price objects — getTotal() should be finite, but collision causes NaN.
//
// DO NOT modify production source. DO NOT assert that NaN should be the result.
// Same test bytes run on controlA, controlB, and combined worktrees.
// Imports use new URL() to produce valid file:// URLs on all platforms.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const catalogUrl = new URL('../src/catalog.js', import.meta.url);
const cartUrl    = new URL('../src/cart.js',    import.meta.url);

const cartExists = existsSync(fileURLToPath(cartUrl));

test('cart getTotal() returns a positive finite number when a catalog product is added', async (t) => {
  if (!cartExists) {
    t.skip('src/cart.js is absent on this branch — cart feature not present');
    return;
  }

  const { getProduct } = await import(catalogUrl.href);
  const { createCart } = await import(cartUrl.href);

  const product = getProduct('p1');
  assert.ok(product !== null, 'getProduct("p1") must return a product');

  const cart = createCart();
  cart.addItem(product, 1);
  const total = cart.getTotal();

  assert.ok(
    typeof total === 'number' && Number.isFinite(total) && total > 0,
    `getTotal() must return a positive finite number when one catalog product is added; got: ${total} (type: ${typeof total}). ` +
    `product.price is: ${JSON.stringify(product.price)}. ` +
    `If total is NaN, cart.getTotal() is multiplying a non-numeric price — this is the collision.`
  );
});

test('cart getTotal() sums multiple catalog products correctly', async (t) => {
  if (!cartExists) {
    t.skip('src/cart.js is absent on this branch — cart feature not present');
    return;
  }

  const { getProduct } = await import(catalogUrl.href);
  const { createCart } = await import(cartUrl.href);

  const p1 = getProduct('p1');
  const p2 = getProduct('p2');
  assert.ok(p1 !== null && p2 !== null, 'Both products must exist in catalog');

  const cart = createCart();
  cart.addItem(p1, 1);
  cart.addItem(p2, 1);
  const total = cart.getTotal();

  assert.ok(
    typeof total === 'number' && Number.isFinite(total) && total > 0,
    `getTotal() with two products must be a positive finite number; got: ${total}. ` +
    `product prices: p1=${JSON.stringify(p1.price)}, p2=${JSON.stringify(p2.price)}.`
  );
});

