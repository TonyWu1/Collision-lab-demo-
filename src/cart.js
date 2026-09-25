// Shopping cart. Assumes product.price is a numeric value in USD.
// Callers pass product objects retrieved from the catalog.

export function createCart() {
  const items = [];

  return {
    addItem(product, quantity = 1) {
      const existing = items.find((i) => i.product.id === product.id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        items.push({ product, quantity });
      }
    },

    removeItem(productId) {
      const idx = items.findIndex((i) => i.product.id === productId);
      if (idx !== -1) items.splice(idx, 1);
    },

    getTotal() {
      // product.price is a number — multiply directly
      return items.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
    },

    getItems() {
      return items.slice();
    },
  };
}
