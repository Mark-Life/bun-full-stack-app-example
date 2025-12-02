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

### Partial

- [ ] **Client-side Navigation** - Currently full page reload, not SPA-style `pushState`

### Implemented (RSC Support)

- [x] **React Server Components (RSC)** - Server-first model with client boundaries
  - Default: Server components (no directive)
  - `"use client"` directive marks client component boundaries
  - Server components can contain client components

### Not Yet Implemented

- [ ] **Suspense Streaming** - Progressive render with loading fallbacks
- [ ] **`loading.tsx`** - Route-level loading states
- [ ] **Server Functions / Data Loaders** - `getServerSideProps`-style data fetching
- [ ] **Static Site Generation (SSG)** - Build-time pre-rendering
- [ ] **Incremental Static Regeneration (ISR)** - On-demand revalidation

## Architecture

**Default model**: React Server Components (RSC).

- Server components (default): Render on server only
- Client components (`"use client"`): Render on server (SSR) + hydrate on client

```
Request → Match route → Render (server + client components)
       → Stream HTML → Hydrate client components only
```

### RSC Flow

1. **No directive** = Server component (render once on server)
2. **`"use client"`** = Client component boundary (hydrates for interactivity)
3. Server components can import client components (client boundaries)

---

Created with `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
