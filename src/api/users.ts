/**
 * Users API routes example
 */

import { z } from "zod";
import { route } from "~/framework/shared/api";

/**
 * User schema
 */
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

/**
 * List users with query params
 */
export const list = route({
  method: "GET",
  query: z.object({
    limit: z.coerce.number().optional(),
    offset: z.coerce.number().optional(),
  }),
  response: z.array(userSchema),
  handler: ({ query }) => {
    // In real app, fetch from database
    const users = [
      { id: "1", name: "John Doe", email: "john@example.com" },
      { id: "2", name: "Jane Smith", email: "jane@example.com" },
    ];

    const limit = query?.limit ?? 10;
    const offset = query?.offset ?? 0;

    return users.slice(offset, offset + limit);
  },
});

/**
 * Get user by ID (with params)
 */
export const byId = route({
  method: "GET",
  params: z.object({ id: z.string() }),
  response: userSchema,
  handler: ({ params }) => {
    // In real app, fetch from database
    return {
      id: params.id,
      name: "John Doe",
      email: "john@example.com",
    };
  },
});

/**
 * Create user (POST with body)
 */
export const create = route({
  method: "POST",
  body: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  response: userSchema,
  handler: ({ body }) => {
    // In real app, save to database
    return {
      id: crypto.randomUUID(),
      name: body.name,
      email: body.email,
    };
  },
});
