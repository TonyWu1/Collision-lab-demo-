// Product catalog. Each product has an id, name, and price.
// Price is represented as an object with amount and currency to support
// multi-currency storefronts.
const products = [
  { id: 'p1', name: 'Widget',  price: { amount: 20,  currency: 'USD' } },
  { id: 'p2', name: 'Gadget',  price: { amount: 45,  currency: 'USD' } },
  { id: 'p3', name: 'Doohick', price: { amount: 8,   currency: 'USD' } },
];

export function getProduct(id) {
  return products.find((p) => p.id === id) ?? null;
}

export function listProducts() {
  return products.slice();
}
