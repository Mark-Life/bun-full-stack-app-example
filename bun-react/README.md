# bun-react-tailwind-shadcn-template

Bun-powered React SSR framework with file-based routing.

## Getting Started

```bash
bun install
bun dev      # development with HMR
bun start    # production
```

## Feature Checklist

### Implemented

- [x] **Server-Side Rendering (SSR)** - `renderToReadableStream` with full HTML streaming
- [x] **File-based Routing** - `page.tsx` / `index.tsx` as route files
- [x] **Nested Layouts** - `layout.tsx` applied root-to-leaf
- [x] **Dynamic Routes** - `[param]` and catch-all `[...param]`
- [x] **Client Hydration** - `hydrateRoot` with route matching
- [x] **HMR** - Hot module reload in development
- [x] **Tailwind CSS** - Bundled via `bun-plugin-tailwind`
- [x] **Public Assets Management** - `src/public/` folder for static assets (icons, images, fonts, etc.) automatically served at root path

### Partial

- [ ] **Client-side Navigation** - Currently full page reload, not SPA-style `pushState`

### Implemented (RSC Support)

- [x] **React Server Components (RSC)** - Server-first model with client boundaries

  - Default: Server components (no wrapper)
  - `clientComponent()` wrapper marks client component boundaries (type-safe)
  - Server components can contain client components
  - Automatic client boundary detection for proper hydration

- [x] **Suspense Streaming** - Progressive render with loading fallbacks
  - Async Server Components stream progressively as promises resolve
  - Suspense boundaries show fallbacks immediately, then stream resolved content
  - Works with `renderToReadableStream` for true progressive HTML streaming

### Implemented (API System)

- [x] **Typesafe API Route Definitions** - Type-safe API route handlers with request/response type inference
  - Code-defined routes with Zod validation
  - tRPC-like type inference from route definitions to client calls
  - Method-specific handlers (GET, POST, PUT, PATCH, DELETE)
  - Support for params, query, body, and response schemas
  - Automatic path generation (e.g., `users.byId` with `params: { id }` → `/api/users/:id`)

- [x] **Proxy (Middleware)** - Request/response middleware for authentication, logging, CORS, etc.
  - Configurable include/exclude patterns (glob-style matching)
  - Selective middleware application per route
  - Request/response interception and modification

### Not Yet Implemented

- [ ] **Dynamic Route Demo** - Example page demonstrating dynamic route parameters (`[param]` and `[...param]`)
- [ ] **`loading.tsx`** - Route-level loading states
- [ ] **Server Functions / Data Loaders** - `getServerSideProps`-style data fetching
- [ ] **Static Site Generation (SSG)** - Build-time pre-rendering
- [ ] **Incremental Static Regeneration (ISR)** - On-demand revalidation
- [ ] **404 page**

## Architecture

**Default model**: React Server Components (RSC).

- Server components (default): Render on server only
- Client components (`clientComponent()` wrapper): Render on server (SSR) + hydrate on client

```
Request → Match route → Render (server + client components)
       → Stream HTML progressively (Suspense fallbacks → resolved content)
       → Hydrate client components only (if present)
```

### RSC Flow

1. **No wrapper** = Server component (render once on server)
2. **`clientComponent()` wrapper** = Client component boundary (hydrates for interactivity)
   ```tsx
   import { clientComponent } from "~/framework/shared/rsc";
   export const MyComponent = clientComponent((props) => { ... });
   ```
3. Server components can import client components (client boundaries)
4. **Async Server Components** = Can use Suspense for progressive streaming

### Suspense Streaming

- Async Server Components suspend during SSR until promises resolve
- Suspense boundaries stream fallbacks first, then resolved content
- Pure server component pages (no client boundaries) skip hydration
- Pages with client components hydrate only the client parts

### Typesafe API System

**Code-first API routes** with full type inference from server to client.

#### Defining Routes

```typescript
// src/api/users.ts
import { z } from "zod";
import { route } from "~/framework/shared/api";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const byId = route({
  method: "GET",
  params: z.object({ id: z.string() }),
  response: userSchema,
  handler: ({ params }) => getUser(params.id),
});

export const create = route({
  method: "POST",
  body: z.object({ name: z.string(), email: z.string().email() }),
  response: userSchema,
  handler: ({ body }) => createUser(body),
});
```

#### Composing Routes

```typescript
// src/api/index.ts
import { createAPI } from "~/framework/shared/api";
import { hello, helloPut } from "./hello";
import * as users from "./users";

export const api = createAPI({
  hello: {
    GET: hello,
    PUT: helloPut,  // Same path, different methods
  },
  users: {
    byId: users.byId,    // → /api/users/:id
    create: users.create,
  },
});
```

#### Client Usage (Fully Typed)

```typescript
// In client components
import { apiClient } from "~/api-client";

// All fully typed - no strings!
const user = await apiClient.users.byId({ params: { id: "123" } });
const newUser = await apiClient.users.create({ name: "John", email: "john@example.com" });
const greeting = await apiClient.hello.GET();
```

#### Middleware

```typescript
// src/middleware.ts
import { defineMiddleware } from "~/framework/shared/middleware";

export default defineMiddleware({
  // Exclude static assets
  exclude: ["/favicon.ico", "/*.svg", "/index.css"],
  
  // OR: Only run on specific paths
  // include: ["/api/**"],
  
  handler: async (request, next) => {
    console.log(`${request.method} ${request.url}`);
    const response = await next();
    
    // Add CORS headers, auth checks, etc.
    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-Custom-Header", "value");
    
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },
});
```

---

Created with `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
