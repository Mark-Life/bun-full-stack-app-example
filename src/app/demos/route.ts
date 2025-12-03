/**
 * Route handler for /demos
 * Redirects to /#demos (homepage with anchor)
 */
export const GET = () => Response.redirect("/#demos", 302);
