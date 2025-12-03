/**
 * Compose all API routes
 */

import { createAPI } from "~/framework/shared/api";
import { hello, helloPut } from "./hello";
// biome-ignore lint/performance/noNamespaceImport: its ok here
import * as products from "./products";
import { revalidate, revalidateTag } from "./revalidate";
// biome-ignore lint/performance/noNamespaceImport: its ok here
import * as users from "./users";

/**
 * Main API instance
 * Routes are composed into nested structure
 * Routes with the same path but different methods are automatically grouped
 */
export const api = createAPI({
  hello: {
    GET: hello,
    PUT: helloPut,
  },
  users: {
    list: users.list,
    byId: users.byId, // → /api/users/:id
    create: users.create,
  },
  products: {
    list: products.list, // → /api/products
    byId: products.byId, // → /api/products/:id
    update: products.update, // → /api/products/:id (PUT)
  },
  revalidate, // → /api/revalidate
  revalidateTag, // → /api/revalidateTag
});
