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

### Not Yet Implemented

- [ ] **React Server Components (RSC)** - Bun supports experimentally (`--server-components`), not integrated
- [ ] **Suspense Streaming** - Progressive render with loading fallbacks
- [ ] **`loading.tsx`** - Route-level loading states
- [ ] **Server Functions / Data Loaders** - `getServerSideProps`-style data fetching
- [ ] **Static Site Generation (SSG)** - Build-time pre-rendering
- [ ] **Incremental Static Regeneration (ISR)** - On-demand revalidation

## Architecture

**Default model**: Server-first SSR. All components render on server, HTML streams to client, then full hydration.

```
Request → Server matches route → Renders with layouts → Streams HTML → Client hydrates
```

---

Created with `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
