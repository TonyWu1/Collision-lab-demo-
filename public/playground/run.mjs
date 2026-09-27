import * as authControl from './auth-control/profileSession.js';
import * as authCombined from './auth-combined/profileSession.js';
import * as authFixed from './auth-fixed/profileSession.js';
import { getUserById } from './auth-combined/users.js';
import { login } from './auth-combined/auth.js';
import { clearProfileCache as clearControl } from './auth-control/profileCache.js';
import { clearProfileCache as clearCombined } from './auth-combined/profileCache.js';
import { clearProfileCache as clearFixed } from './auth-fixed/profileCache.js';
import * as numericCatalog from './price-control/catalog.js';
import * as objectCatalog from './price-combined/catalog.js';
import { createCart as controlCart } from './price-control/cart.js';
import { createCart as combinedCart } from './price-combined/cart.js';
import * as physicalStore from './delete-control/userStore.js';
import * as softStore from './delete-combined/userStore.js';
import * as physicalReport from './delete-control/reporting.js';
import * as softReport from './delete-combined/reporting.js';
export function runScenario(scenario, options = {}) {
  const start = performance.now();
  let expected, control, actual, trace, source;
  if (scenario === 'auth') {
    const user = getUserById(options.userId ?? 'u1');
    if (!user) throw new Error('Choose a sample user.');
    clearControl(); clearCombined(); clearFixed();
    expected = user.id;
    control = authControl.loginAndLoadProfile(user.username)?.id ?? null;
    const authenticated = login(user.email);
    if (!authenticated) throw new Error('Authentication setup failed.');
    const profile = (options.fixed ? authFixed : authCombined).loginAndLoadProfile(user.email);
    actual = profile?.id ?? null;
    trace = [`login(${JSON.stringify(user.email)}) → ${authenticated.id}`, `cache key → ${options.fixed ? user.id : user.username}`, `lookup key → ${options.fixed ? user.id : user.email}`, `profile → ${profile ? profile.displayName : 'null'}`];
    source = options.fixed ? 'auth-fixed/profileSession.js' : 'auth-combined/profileSession.js';
  } else if (scenario === 'price') {
    const quantity = Number(options.quantity ?? 2);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new Error('Quantity must be a whole number from 1 to 50.');
    const product = numericCatalog.getProduct(options.productId ?? 'p1');
    const changed = objectCatalog.getProduct(options.productId ?? 'p1');
    if (!product || !changed) throw new Error('Choose a sample product.');
    const a = controlCart(), b = combinedCart(); a.addItem(product, quantity); b.addItem(changed, quantity);
    expected = product.price * quantity; control = a.getTotal(); actual = b.getTotal();
    trace = [`catalog → ${JSON.stringify(changed.price)}`, `quantity → ${quantity}`, 'cart → product.price × quantity', `total → ${String(actual)}`];
    source = 'price-combined/cart.js';
  } else if (scenario === 'delete') {
    const count = Number(options.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error('Choose between 1 and 3 users to remove.');
    physicalStore.resetUsers(); softStore.resetUsers();
    for (let i = 1; i <= count; i++) { physicalStore.removeUser(`u${i}`); softStore.removeUser(`u${i}`); }
    expected = 3 - count; control = physicalReport.getActiveUserCount(); actual = softReport.getActiveUserCount();
    trace = [`remove ${count} user${count > 1 ? 's' : ''} → deleted: true`, `stored records → ${softStore.getAllUsers().length}`, `active records → ${softStore.getAllUsers().filter(u => !u.deleted).length}`, `report → ${actual}`];
    source = 'delete-combined/reporting.js';
  } else throw new Error('Unknown scenario.');
  return { scenario, expected, control, actual, controlPassed: Object.is(control, expected), passed: Object.is(actual, expected), trace, source, durationMs: performance.now() - start, ranAt: new Date().toISOString() };
}
export function displayValue(value) { return value === null ? 'null' : String(value); }
