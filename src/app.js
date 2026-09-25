import { getUserById } from './users.js';
import { login } from './auth.js';
import { cacheUser, getCachedUser, clearCache } from './cache.js';

clearCache();
const user = getUserById('u1');
console.log('1. Found user:', user);
const loggedInUser = login(user.email);
console.log('2. Logged in with email:', loggedInUser);
cacheUser(loggedInUser);
console.log('3. Cached user with ID:', loggedInUser.id);
console.log('4. Retrieved cached user:', getCachedUser(loggedInUser.id));
