/**
 * On-demand revalidation API endpoint
 * Used for triggering ISR revalidation when content changes (e.g., product updates)
 */

import { z } from "zod";
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
