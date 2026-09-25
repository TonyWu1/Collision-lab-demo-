// Product catalog. Each product has an id, name, and a numeric price in USD.
const products = [
  { id: 'p1', name: 'Widget',  price: 20 },
  { id: 'p2', name: 'Gadget',  price: 45 },
  { id: 'p3', name: 'Doohick', price: 8  },
];

export function getProduct(id) {
  return products.find((p) => p.id === id) ?? null;
}

export function listProducts() {
  return products.slice();
}
