# Hypothesis: feature/price-object-v2 × feature/cart

## Branch behaviours (independent)

**feature/price-object-v2** (`src/catalog.js`)  
Changes product price from a plain number to a structured object `{ amount: number, currency: string }`.  
Rationale: support multi-currency storefronts.  
The branch adds `tests/catalog.test.js` which asserts `typeof p.price === 'object'` and `p.price.amount === 20`.

**feature/cart** (`src/cart.js`)  
Introduces a shopping cart. `createCart().getTotal()` computes:
```js
items.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0)
```
The comment reads: `// product.price is a number — multiply directly`.  
The branch's own test fixtures use `{ id: 'p1', price: 20 }` (numeric).  
Independently it passes all tests.

## Expected combined behaviour

On the merged codebase:
- `getProduct('p1')` returns `{ id: 'p1', name: 'Widget', price: { amount: 20, currency: 'USD' } }`
- Passing that product to `cart.addItem()` and calling `cart.getTotal()` evaluates:
  `{ amount: 20, currency: 'USD' } * 1` → `NaN` (JavaScript coerces object to number)
- Any arithmetic on `NaN` propagates: multi-item totals also return `NaN`.

## Specific incompatible assumption

`feature/cart` assumes `product.price` is a primitive number (JavaScript `number`).  
`feature/price-object-v2` changes `product.price` to `{ amount, currency }`.  
These assumptions are mutually exclusive: the cart's `getTotal()` multiply does not know to extract `.amount`.

This is a **composition incompatibility** — neither branch is defective in isolation; the fault only appears when catalog products are fed into the cart after the merge.

## Source citations

- `feature/cart` @ `bd96dff`: `src/cart.js` line 23 — `sum + product.price * quantity`
- `feature/cart` @ `bd96dff`: `src/cart.js` line 2 — comment "Assumes product.price is a numeric value in USD"
- `feature/price-object-v2` @ `0f23c69`: `src/catalog.js` lines 4–8 — price fields changed to `{ amount, currency }` objects

## Observable assertion that could disprove the hypothesis

Create a cart, add a product fetched from the live catalog (`getProduct('p1')`), and assert that `getTotal()` returns a positive finite number.  
On the merged codebase this should return `NaN`; on branch A alone `catalog.js` exists with no cart; on branch B alone the cart exists with numeric-price catalog.

If `getTotal()` returns `20` (or any finite number), the hypothesis is disproved.

