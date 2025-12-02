/**
 * Product management API endpoints
 */

import { z } from "zod";
import { route } from "~/framework/shared/api";
import {
  getAllProductsAdmin,
  getProductById,
  type Product,
  updateProduct,
} from "~/lib/products";

export const list = route({
  method: "GET",
  response: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      price: z.number(),
      status: z.enum(["draft", "live"]),
      updatedAt: z.number(),
    })
  ),
  handler: async () => await getAllProductsAdmin(),
});

export const byId = route({
  method: "GET",
  params: z.object({ id: z.string() }),
  response: z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      price: z.number(),
      status: z.enum(["draft", "live"]),
      updatedAt: z.number(),
    })
    .nullable(),
  handler: async ({ params }) => await getProductById(params.id),
});

export const update = route({
  method: "PUT",
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.number().optional(),
    status: z.enum(["draft", "live"]).optional(),
  }),
  response: z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      price: z.number(),
      status: z.enum(["draft", "live"]),
      updatedAt: z.number(),
    })
    .nullable(),
  handler: async ({ params, body }) =>
    await updateProduct(
      params.id,
      body as Partial<Omit<Product, "id" | "updatedAt">>
    ),
});
