/**
 * Hello API route example
 */

import { z } from "zod";
import { route } from "~/framework/shared/api";

/**
 * Simple GET route
 */
export const hello = route({
  method: "GET",
  response: z.object({
    message: z.string(),
    timestamp: z.number(),
  }),
  handler: () => ({
    message: "Hello, world!",
    timestamp: Date.now(),
  }),
});

/**
 * PUT route with body
 */
export const helloPut = route({
  method: "PUT",
  body: z.object({
    name: z.string().optional(),
  }),
  response: z.object({
    message: z.string(),
    method: z.literal("PUT"),
    timestamp: z.number(),
  }),
  handler: ({ body }) => ({
    message: body?.name ? `Hello, ${body.name}!` : "Hello, world!",
    method: "PUT" as const,
    timestamp: Date.now(),
  }),
});
