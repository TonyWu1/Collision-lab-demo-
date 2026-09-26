# Analysis: feature/price-object-v2 × feature/cart

**Analysis directory:** `scripts/reports/analysis-1790395659460`  
**Phase:** 13  
**Verdict:** CONFIRMED  
**Created:** 2026-09-26T04:09:00Z

---

## Branches

| | Ref | SHA |
|---|---|---|
| A | `feature/price-object-v2` | `0f23c69` |
| B | `feature/cart` | `bd96dff` |
| merge-base | | `2333e05` |

No requirements file supplied.

---

## Hypothesis

`feature/price-object-v2` changes `src/catalog.js` so that `product.price` is `{ amount: number, currency: string }` instead of a plain number.

`feature/cart` introduces `src/cart.js` with `getTotal()` computing `product.price * quantity` — numeric multiplication, with an explicit code comment "Assumes product.price is a numeric value in USD."

After merging, passing a catalog product into the cart causes `getTotal()` to compute `{ amount: 20, currency: 'USD' } * 1` → `NaN`. This propagates to every multi-item total as well.

**Incompatible assumption:** cart assumes `product.price` is a primitive number; catalog branch changes it to an object.

---

## Test results

### Independent suites

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Branch A (price-object-v2) existing | 15 | 15 | 0 | 0 |
| Branch B (cart) existing | 17 | 17 | 0 | 0 |

Both branch suites pass independently. ✓

### Merge

Clean textual merge (ort strategy). Files changed: `src/catalog.js`, `tests/catalog.test.js`. No unmerged paths.

### Merged existing suite

| Tests | Passed | Failed | Skipped |
|---|---|---|---|
| 20 | 20 | 0 | 0 |

**No collision detected by existing merged tests.** The cart's own tests use hardcoded numeric fixtures (`{ price: 20 }`), not products from the live catalog. They pass even on merged code because they never exercise the catalog→cart integration path.

### Generated test controls

| Run | Tests | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| Control A (price-object-v2) | 2 | 0 | 0 | 2 | `cart.js` absent → both skipped |
| Control B (cart) | 2 | 2 | 0 | 0 | Numeric catalog × cart passes |
| Combined | 2 | 0 | 2 | 0 | NaN — collision triggered |

**Control pattern:** `A: 0/2/0 | B: 2/0/0 | combined: 0/2/0` (pass/skip/fail). Matches expected.

### Combined failure detail

```
error: 'getTotal() must return a positive finite number when one catalog product is added;
       got: NaN (type: number). product.price is: {"amount":20,"currency":"USD"}.
       If total is NaN, cart.getTotal() is multiplying a non-numeric price — the collision.'
code: ERR_ASSERTION  operator: ==  expected: true  actual: false
```

This is a **semantic assertion failure**, not a setup error. The import succeeded, the product was retrieved correctly, and the arithmetic itself produced `NaN`.

---

## Verdict: CONFIRMED

Both branch suites pass independently. Merge is textually clean. The existing merged suite does not detect the collision (cart tests use hardcoded fixtures). The generated test demonstrates: control B passes (numeric prices work), combined fails (price object breaks multiplication), confirming the composition incompatibility.

---

## Suggested fix (not applied)

Change `cart.getTotal()` to extract `price.amount` when price is an object:

```js
const p = typeof product.price === 'object' ? product.price.amount : product.price;
return sum + p * quantity;
```

Or normalize at `addItem()`. Do not change the catalog's price representation.

---

## Note on prior attempt

A first attempt (`analysis-1790395577528`) failed with `ERR_UNSUPPORTED_ESM_URL_SCHEME` because the generated test used `path.resolve()` in a `dynamic import()` on Windows. This is a **setup error**, not a semantic assertion failure. The analysis was re-prepared as `analysis-1790395659460` with `new URL()` imports. The prior run is preserved for transparency.

