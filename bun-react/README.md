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
- [x] **Incremental Static Regeneration (ISR)** - Time-based and on-demand revalidation with hybrid cache

### Implemented

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

### Implemented (Static Site Generation)

- [x] **Static Site Generation (SSG)** - Build-time pre-rendering with `definePage()`
  - Declare pages as `static` or `dynamic` (default: `dynamic`)
  - `loader` function for build-time data fetching
  - `generateParams` for static dynamic routes
  - Pre-rendered HTML served in production, SSR fallback

- [x] **404 Page** - Custom not-found component (`not-found.tsx`)
  - Place `not-found.tsx` in `src/app/` directory
  - Supports layouts, SSR, and client components
  - Automatically returns HTTP 404 status

### Implemented (Client-Side Navigation)

- [x] **Client-Side Navigation** - SPA-style navigation for route groups
  - Layout-based opt-in with `clientNavigation: true`
  - Uses `pushState` for instant navigation without page reloads
  - Layouts persist during navigation
  - Browser back/forward buttons work correctly
  - Automatic fallback to full page reload when leaving client-navigable groups

### Not Yet Implemented

- [ ] **`loading.tsx`** - Route-level loading states

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

#### Incremental Static Regeneration (ISR)

ISR allows static pages to be regenerated at runtime without requiring a full rebuild. Pages are served from cache and revalidated in the background when stale.

**ISR-Enabled Static Page**

```typescript
// app/products/page.tsx
import { definePage } from "~/framework/shared/page";

export default definePage({
  type: 'static',
  revalidate: 3600, // Revalidate every hour (in seconds)
  loader: async () => {
    const products = await fetchProducts();
    return { products };
  },
  component: ({ data }) => (
    <div>
      <h1>Products</h1>
      {data.products.map(product => <Product key={product.id} {...product} />)}
    </div>
  ),
});
```

**ISR-Enabled Dynamic Route**

```typescript
// app/products/[id]/page.tsx
import { definePage } from "~/framework/shared/page";

export default definePage({
  type: 'static',
  revalidate: 3600, // Revalidate every hour
  generateParams: async () => {
    const products = await fetchAllProducts();
    return products.map(p => ({ id: p.id }));
  },
  loader: async (params) => {
    const product = await getProductById(params.id);
    return { product };
  },
  component: ({ params, data }) => (
    <div>
      <h1>{data.product.name}</h1>
      <p>{data.product.description}</p>
    </div>
  ),
});
```

**How ISR Works**

1. **First Request**: Page is rendered and cached (served with `X-Cache: MISS`)
2. **Subsequent Requests**: 
   - If cache is fresh (< revalidate seconds old): Served from cache (`X-Cache: HIT`)
   - If cache is stale: Served stale content (`X-Cache: STALE`) while regenerating in background
3. **Background Revalidation**: Stale pages are regenerated automatically with concurrency limit (max 3 concurrent)
4. **Cache Storage**: Hybrid cache (in-memory + disk) - survives server restarts

**On-Demand Revalidation**

Trigger immediate revalidation via API endpoint:

```typescript
// When content changes (e.g., product updated)
await fetch('/api/revalidate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: '/products/123',
    secret: process.env.REVALIDATE_SECRET,
  }),
});
```

The revalidation API:
- Invalidates existing cache
- Immediately regenerates the page
- Updates cache with fresh content

**Cache Headers**

Responses include `X-Cache` header for debugging:
- `HIT` - Served from fresh cache
- `STALE` - Served stale content, revalidating in background
- `MISS` - First request, rendered and cached

**Example: Product Portal**

See `/products` and `/admin/products` routes in this project for a complete ISR example:
- Products listing page with ISR (`revalidate: 60` seconds)
- Product detail pages with ISR (`revalidate: 3600` seconds = 1 hour)
- Admin panel to update products and trigger on-demand revalidation

#### Static Site Generation (SSG)

Define pages as static (pre-rendered at build time) or dynamic (rendered on request).

**Static Page**

```typescript
// app/about/page.tsx
import { definePage } from "~/framework/shared/page";

export default definePage({
  type: 'static',
  component: () => (
    <div>
      <h1>About Us</h1>
      <p>This page is pre-rendered at build time.</p>
    </div>
  ),
});
```

**Static Page with Loader**

```typescript
// app/blog/page.tsx
import { definePage } from "~/framework/shared/page";

export default definePage({
  type: 'static',
  loader: async () => {
    const posts = await fetchPosts();
    return { posts };
  },
  component: ({ data }) => (
    <div>
      <h1>Blog</h1>
      {data.posts.map(post => <Post key={post.id} {...post} />)}
    </div>
  ),
});
```

**Static Dynamic Route**

```typescript
// app/blog/[slug]/page.tsx
import { definePage } from "~/framework/shared/page";

export default definePage({
  type: 'static',
  generateParams: async () => {
    const posts = await fetchAllPosts();
    return posts.map(p => ({ slug: p.slug }));
  },
  component: ({ params }) => <BlogPost slug={params.slug} />,
});
```

**Dynamic Page (Default)**

```typescript
// app/dashboard/page.tsx
// No wrapper = dynamic (SSR)
export default function Dashboard() {
  return <div>Always server-rendered</div>;
}

// OR explicit
import { definePage } from "~/framework/shared/page";
export default definePage({
  type: 'dynamic',
  component: Dashboard,
});
```

**Build Output**

Static pages are pre-rendered to `dist/pages/`:
```
dist/
├── hydrate.js
├── index.css
└── pages/
    ├── index.html          # / (if static)
    ├── about/
    │   └── index.html      # /about
    └── blog/
        ├── post-1/
        │   └── index.html  # /blog/post-1
        └── post-2/
            └── index.html  # /blog/post-2
```

In production, static HTML is served directly. Dynamic pages fall back to SSR.

#### 404 Page (Not Found)

Create a custom 404 page by adding `not-found.tsx` to the app directory. This component will be rendered when routes are not found, with full SSR and layout support.

**Custom 404 Page**

```typescript
// app/not-found.tsx
import { Link } from "@/components/link";

export default function NotFound() {
  return (
    <div className="container mx-auto p-8 text-center">
      <h1 className="mb-4 text-4xl font-bold">404</h1>
      <p className="mb-8 text-muted-foreground">Page not found</p>
      <Link href="/" className="text-blue-600 hover:underline">
        Go back home
      </Link>
    </div>
  );
}
```

The `not-found.tsx` component:
- Inherits layouts from the root layout (`app/layout.tsx`)
- Supports both server and client components
- Receives no props (no params or data)
- Returns HTTP status 404 automatically

#### Client-Side Navigation

Enable SPA-style navigation for specific route groups using `defineLayout()` with `clientNavigation: true`. All child routes under that layout will use client-side navigation (no page reloads).

**Basic Layout with Client Navigation**

```typescript
// app/dashboard/layout.tsx
import { defineLayout } from "~/framework/shared/layout";
import { Link } from "@/components/link";

export default defineLayout({
  clientNavigation: true, // Enable client-side navigation for all /dashboard/* routes
  component: ({ children }) => (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-xl font-bold">Dashboard</h1>
            <div className="flex gap-4">
              <Link href="/dashboard">Home</Link>
              <Link href="/dashboard/settings">Settings</Link>
              <Link href="/dashboard/profile">Profile</Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="container mx-auto p-8">{children}</main>
    </div>
  ),
});
```

**How It Works**

1. **Layout-Based**: Add `clientNavigation: true` to a layout - all child routes inherit this behavior
2. **Automatic Detection**: The framework detects layouts with client navigation enabled
3. **SPA Navigation**: Links within the same client-navigable group use `pushState` instead of full page reloads
4. **Layout Persistence**: Layouts stay mounted during navigation, only page content changes
5. **Cross-Group Navigation**: Navigating outside the client-navigable group triggers a full page reload

**Navigation Behavior**

- **Within Group**: `/dashboard` → `/dashboard/settings` = Client-side navigation (instant, no reload)
- **Between Groups**: `/dashboard` → `/docs` = Full page reload (entering different group)
- **Leaving Group**: `/dashboard/settings` → `/` = Full page reload (leaving client-navigable group)

**Example: Dashboard with Multiple Pages**

```typescript
// app/dashboard/page.tsx
export default function DashboardHome() {
  return <div>Dashboard Home</div>;
}

// app/dashboard/settings/page.tsx
export default function DashboardSettings() {
  return <div>Settings Page</div>;
}

// app/dashboard/profile/page.tsx
export default function DashboardProfile() {
  return <div>Profile Page</div>;
}
```

All routes under `/dashboard` will use client-side navigation. The navigation bar in the layout persists, and only the page content updates.

**Link Component Behavior**

The `Link` component automatically detects when both current and target routes are in the same client-navigable group:

```typescript
import { Link } from "@/components/link";

// Within same client-navigable group → client-side navigation
<Link href="/dashboard/settings">Settings</Link>

// Different groups → full page reload
<Link href="/docs">Documentation</Link>
```

**Browser Navigation**

- **Back/Forward Buttons**: Work correctly with client-side navigation
- **URL Updates**: Browser URL updates without page reload
- **History State**: Properly managed for client-navigable routes

**See It In Action**

Check out the `/dashboard` route group in this project for a complete example with multiple pages demonstrating client-side navigation.

---

Created with `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
