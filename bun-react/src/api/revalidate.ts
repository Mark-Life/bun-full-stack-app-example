/**
 * On-demand revalidation API endpoint
 * Used for triggering ISR revalidation when content changes (e.g., product updates)
 */

import { z } from "zod";
import { invalidateComponentCacheByTag } from "~/framework/server/cache";
import { revalidatePath } from "~/framework/server/revalidate";
import { route } from "~/framework/shared/api";

export const revalidate = route({
  method: "POST",
  body: z.object({
    path: z.string(),
  }),
  response: z.object({
    revalidated: z.boolean(),
    path: z.string(),
  }),
  handler: async ({ body }) => {
    // in production add authorization check

    const success = await revalidatePath(body.path);
    return {
      revalidated: success,
      path: body.path,
    };
  },
});

/**
 * Tag-based cache invalidation endpoint
 * Used for invalidating component caches by tag (for PPR)
 */
export const revalidateTag = route({
  method: "POST",
  body: z.object({
    tag: z.string(),
  }),
  response: z.object({
    revalidated: z.boolean(),
    tag: z.string(),
    invalidated: z.number(),
  }),
  handler: async ({ body }) => {
    // in production add authorization check

    const invalidated = await invalidateComponentCacheByTag(body.tag);
    return {
      revalidated: invalidated > 0,
      tag: body.tag,
      invalidated,
    };
  },
});
