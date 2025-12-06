# Client Navigation & Performance Improvement Plan

> **Goal**: Transform the framework from full-page-reload navigation to SPA-style client navigation with improved hydration performance and type-safe server functions.

## Executive Summary

| Phase | Goal | Priority | Complexity |
|-------|------|----------|------------|
| 1 | Route Data Endpoints | High | Medium |
| 2 | Optimistic Client Router | High | Medium |
| 3 | Improved Hydration | Medium | High |
| 4 | Server Functions | Medium | Medium |

**Key Decisions**:
- Security model: Hash-based endpoint IDs
- Client navigation: **Default behavior** (remove `clientNavigable` opt-in)
- Data format: Full payload (data + route metadata + chunks)

---

## Phase 1: Route Data Endpoints

### Goal

Create `/__data/[...path]` endpoints that return JSON payloads for client-side navigation, eliminating full page reloads.

### Data Payload Schema

```typescript
interface NavigationPayload {
  // Page data from loader
  data: unknown;
  
  // Route metadata
  route: {
    path: string;
    pageType: "static" | "dynamic";
    hasClientComponents: boolean;
    params: Record<string, string>;
  };
  
  // Chunks to preload (JS only, CSS loaded globally)
  chunks: string[];
  
  // Head/meta updates
  head: {
    title?: string;
    description?: string;
    canonical?: string;
    openGraph?: Record<string, string>;
  };
  
  // Navigation signals
  redirect?: string;
  notFound?: boolean;
  
  // Security
  hash: string;
}
```

### Implementation Steps

#### Step 1.1: Create Navigation Payload Types

Create a new shared types file for navigation payload schema.

**Files to create**:
- `src/framework/shared/navigation-payload.ts`

**Contains**:
- `NavigationPayload` interface
- `HeadData` interface
- `RouteMetadata` interface
- Helper type utilities

#### Step 1.2: Add generateMetadata Support to Page Config

Extend page configuration to support metadata generation.

**Files to modify**:
- `src/framework/shared/page.ts`

**Changes**:
- Add `generateMetadata` to `PageConfig` interface
- Add `hasGenerateMetadata()` detection function
- Add `extractGenerateMetadata()` for build-time detection

**Example page config**:
```typescript
// Example: src/app/products/[id]/page.tsx
export const config = {
  loader: async (params) => {
    return await db.products.findById(params.id);
  },
  generateMetadata: async ({ params, data }) => {
    return {
      title: `${data.name} - $${data.price}`,
      description: data.description,
      openGraph: {
        title: data.name,
        image: data.imageUrl,
      },
    };
  },
};
```

#### Step 1.3: Create Hash Generation Utility

Create utility for generating secure content hashes.

**Files to create**:
- `src/framework/server/hash.ts`

**Contains**:
- `generatePayloadHash(payload: NavigationPayload): string`
- Uses SHA-256 with build-time salt
- Salt stored in environment variable or generated at build

#### Step 1.4: Create Data Endpoint Handler

Add `/__data/*` route handler to server.

**Files to modify**:
- `src/framework/server/index.ts`

**New route**:
```
/__data/* → handleDataRequest()
```

**Handler logic**:
1. Extract route path from URL (remove `/__data` prefix)
2. Match route using existing `matchRoute()`
3. Load page module
4. Execute loader if present
5. Execute generateMetadata if present
6. Get chunks from manifest
7. Check for redirects (new feature)
8. Build payload with hash
9. Return JSON response

**Files to create**:
- `src/framework/server/data-handler.ts`

**Contains**:
- `handleDataRequest(req: Request): Promise<Response>`
- `buildNavigationPayload()` helper
- `handleRedirect()` logic
- Error handling for loader failures

#### Step 1.5: Add Redirect Support to Page Config

Enable server-side redirects during navigation.

**Files to modify**:
- `src/framework/shared/page.ts`

**Add to PageConfig**:
- `redirect?: (params) => string | null | Promise<string | null>`

**Example usage**:
```typescript
// Example: src/app/old-path/page.tsx
export const config = {
  redirect: () => '/new-path',
};

// Example: src/app/admin/page.tsx  
export const config = {
  redirect: async (params) => {
    const user = await getUser();
    if (!user.isAdmin) return '/login';
    return null; // No redirect
  },
};
```

#### Step 1.6: Update Chunk Manifest for Navigation

Ensure chunk manifest includes all needed info for preloading.

**Files to modify**:
- `src/framework/shared/chunk-manifest.ts`
- `build.ts` (chunk manifest generation)

**Changes**:
- Include chunk sizes for prioritization ✅ **COMPLETED** - Chunks already include size for prioritization
- Add chunk type (page vs layout vs shared) ⚠️ **NOT IMPLEMENTED** - See note below
- Ensure manifest is available at runtime ✅ **COMPLETED** - Manifest is loaded at server startup

**Note on Chunk Type Implementation**:

Currently, the chunk manifest does not distinguish between page, layout, and shared chunks. The build process uses a heuristic that includes all chunks for routes that need hydration, but doesn't categorize them by type.

**Options to implement chunk type**:

1. **Add type field to chunk entries** (Recommended for future):
   - Extend chunk manifest type to include `type: "page" | "layout" | "shared"`
   - Analyze chunk contents or use Bun's metafile (if available) to determine type
   - Update `build.ts` to categorize chunks during manifest generation
   - Allows client to prioritize page chunks over layout/shared chunks

2. **Keep current approach** (Current state):
   - All chunks are treated equally
   - Simpler implementation, works for basic use cases
   - Can be enhanced later when better chunk analysis is available

3. **Use filename heuristics** (Quick win):
   - Infer chunk type from filename patterns (e.g., chunks containing route paths = page chunks)
   - Less accurate but doesn't require deep analysis
   - Can be implemented quickly as a stopgap

**Current Status**: Chunk sizes are included and manifest is available at runtime. Chunk type categorization is deferred until better chunk analysis is available or deemed necessary for optimization.

### Testing Checklist for Phase 1

- [ ] `/__data/` returns 404 for unknown routes
- [ ] `/__data/products/123` returns correct payload for dynamic route
- [ ] Payload includes all chunks needed for route
- [ ] Hash changes when data changes
- [ ] Redirects return proper payload structure
- [ ] Loader errors return error payload (not crash)
- [ ] Static routes return cached data correctly

---

## Phase 2: Optimistic Client Router

### Goal

Replace current navigation behavior with SPA-style client routing that:
1. Intercepts all `<Link>` clicks
2. Uses `history.pushState` immediately
3. Fetches data from `/__data/` endpoints
4. Updates DOM without full reload

### Implementation Steps

#### Step 2.1: Remove clientNavigable Flag

Remove the opt-in system entirely - all routes use client navigation.

**Files to modify**:
- `src/framework/shared/router.ts`
  - Remove `clientNavigable` from `RouteInfo`
- `src/framework/shared/routes-plugin.ts`
  - Remove `clientNavigable` from generated routes
- `src/framework/shared/layout.ts`
  - Remove `hasClientNavigation()` function
- `src/framework/client/router.tsx`
  - Remove `ClientNavigationContext` and `ClientNavigationProvider`
  - Simplify to single `RouterProvider`
- `src/framework/client/hydrate.tsx`
  - Remove `clientNavigable` checks
  - Always use new navigation system

#### Step 2.2: Create Navigation State Manager

Create central navigation state management.

**Files to create**:
- `src/framework/client/navigation-state.ts`

**Contains**:
- `NavigationState` interface (current route, loading state, error)
- `createNavigationStore()` - simple state container
- `useNavigationState()` hook

**State shape**:
```typescript
interface NavigationState {
  currentPath: string;
  currentParams: Record<string, string>;
  isNavigating: boolean;
  pendingPath: string | null;
  error: Error | null;
}
```

#### Step 2.3: Create Data Fetcher

Create client-side data fetching utility.

**Files to create**:
- `src/framework/client/fetch-route-data.ts`

**Contains**:
- `fetchRouteData(path: string): Promise<NavigationPayload>`
- Request deduplication (don't fetch same path twice simultaneously)
- Error handling and retry logic
- Hash verification

**Behavior**:
1. Fetch `/__data/${path}`
2. Parse JSON response
3. Verify hash (optional, configurable)
4. Handle redirect responses
5. Handle not-found responses
6. Return typed payload

#### Step 2.4: Create Chunk Preloader

Create utility to preload route chunks.

**Files to create**:
- `src/framework/client/preload-chunks.ts`

**Contains**:
- `preloadChunks(chunks: string[]): Promise<void>`
- `preloadChunk(path: string): Promise<void>`
- Uses `<link rel="modulepreload">` or dynamic import
- Tracks already-loaded chunks to avoid duplicates

#### Step 2.5: Create Head Manager

Create utility to update document head.

**Files to create**:
- `src/framework/client/head-manager.ts`

**Contains**:
- `updateHead(head: HeadData): void`
- Updates `<title>`
- Updates/creates meta tags
- Updates Open Graph tags
- Handles canonical URL

#### Step 2.6: Rewrite RouterProvider

Complete rewrite of the router provider.

**Files to modify**:
- `src/framework/client/router.tsx`

**New behavior**:
1. On mount: Initialize state from current URL
2. Listen to `popstate` for browser back/forward
3. Provide `navigate(path)` function
4. Provide `prefetch(path)` function
5. Manage loading states
6. Handle errors gracefully

**Navigate flow**:
```
navigate(path) called
  → Set isNavigating = true
  → pushState immediately (optimistic)
  → Fetch /__data/path
  → If redirect: navigate(redirect) recursively
  → If notFound: show 404 component
  → Preload chunks (parallel)
  → Wait for chunk + data
  → Update page component
  → Update head
  → Set isNavigating = false
```

#### Step 2.7: Rewrite Link Component

Simplify Link to always use client navigation.

**Files to modify**:
- `src/components/link.tsx`

**Changes**:
- Remove `clientNavigable` logic
- Always call `router.navigate(href)` on click
- Add `prefetch` prop (boolean, default true)
- Prefetch on hover or viewport intersection
- Keep `aria-current="page"` for active state

**New props**:
```typescript
interface LinkProps {
  href: ValidRoutes;
  children: ReactNode;
  className?: string;
  prefetch?: boolean; // Default: true
  replace?: boolean;  // Use replaceState instead of pushState
  scroll?: boolean;   // Scroll to top after navigation (default: true)
}
```

#### Step 2.8: Add Prefetching

Implement intelligent prefetching.

**Files to modify**:
- `src/components/link.tsx`
- `src/framework/client/router.tsx`

**Prefetch triggers**:
1. **Hover**: Prefetch after 100ms hover
2. **Viewport**: Prefetch when link enters viewport (IntersectionObserver)
3. **Manual**: `router.prefetch(path)` API

**Prefetch behavior**:
- Fetch `/__data/path` and cache response
- Preload route chunks
- Don't prefetch if already cached
- Respect user's data-saver preference

#### Step 2.9: Add Loading Indicators

Provide loading state for navigation.

**Files to create**:
- `src/framework/client/navigation-progress.tsx`

**Contains**:
- `useNavigationProgress()` hook
- Optional `<NavigationProgress />` component (thin top bar like YouTube/GitHub)

**Usage in app**:
```typescript
// In root layout
import { NavigationProgress } from "~/framework/client/navigation-progress";

export default function RootLayout({ children }) {
  return (
    <>
      <NavigationProgress />
      {children}
    </>
  );
}
```

#### Step 2.10: Update Hydration Entry

Update hydrate.tsx to use new router.

**Files to modify**:
- `src/framework/client/hydrate.tsx`

**Changes**:
- Remove old `ClientNavigationProvider` usage
- Use new `RouterProvider`
- Initialize from `__ROUTE_DATA__` as before
- Simplified component tree

### Testing Checklist for Phase 2

- [ ] Clicking Link doesn't cause full page reload
- [ ] URL updates immediately on click
- [ ] Back/forward buttons work correctly
- [ ] Data loads and page updates
- [ ] Head (title, meta) updates on navigation
- [ ] Prefetch works on hover
- [ ] Loading indicator shows during navigation
- [ ] Redirects work correctly
- [ ] 404 pages display correctly
- [ ] Errors show error boundary, not crash
- [ ] Scroll position resets on navigation
- [ ] Works with dynamic routes (`/products/:id`)
- [ ] Works with catch-all routes (`/docs/*slug`)

---

## Phase 3: Improved Hydration

### Goal

Reduce Time to Interactive (TTI) from ~1 second to <300ms by:
1. Selective hydration (only hydrate interactive components)
2. Parallel chunk loading
3. Deferred non-critical hydration

### Implementation Steps

#### Step 3.1: Analyze Current Hydration Bundle

Before optimizing, understand current state.

**Files to examine**:
- `dist/hydrate.js` (after build)
- `dist/*.js` chunks

**Metrics to capture**:
- Total bundle size
- Individual chunk sizes
- Time to hydrate (measure in browser)
- Main thread blocking time

#### Step 3.2: Implement Selective Hydration Markers

Mark components that need hydration vs static HTML.

**Concept**:
- Server renders all components to HTML
- Only components with `"use client"` directive get hydration
- Static server components stay as HTML (no JS)

**Files to modify**:
- `src/framework/server/render.tsx`

**Changes**:
- Add `data-hydrate="true"` attribute to client component roots
- Add unique ID for each hydration target
- Include component chunk info in marker

**Example output**:
```html
<div data-hydrate="true" data-chunk="chunk-button-a3b4c5.js" data-component="Button">
  <!-- Server-rendered button HTML -->
</div>
```

#### Step 3.3: Create Island Hydration System

Hydrate components individually instead of entire tree.

**Files to create**:
- `src/framework/client/island-hydration.ts`

**Contains**:
- `hydrateIslands(): void` - find and hydrate all marked components
- `hydrateIsland(element: Element): void` - hydrate single component
- Priority queue (hydrate visible/interactive first)

**Hydration order**:
1. Components in viewport (visible)
2. Components with event handlers attached (interactive)
3. Everything else (deferred)

#### Step 3.4: Implement Visibility-Based Hydration

Defer hydration of off-screen components.

**Files to modify**:
- `src/framework/client/island-hydration.ts`

**Uses IntersectionObserver**:
- Observe all hydration targets
- Hydrate when entering viewport
- Option to hydrate on idle (requestIdleCallback)

#### Step 3.5: Reduce Initial Bundle Size

Ensure only essential code loads initially.

**Files to modify**:
- `src/framework/client/hydrate.tsx`
- `src/framework/shared/routes-plugin.ts`
- `build.ts`

**Changes**:
- Don't import all routes upfront
- Lazy-load route components on demand
- Tree-shake unused code more aggressively
- Consider separate entry points per route (advanced)

#### Step 3.6: Add Hydration Timing Metrics

Measure hydration performance.

**Files to create**:
- `src/framework/client/hydration-metrics.ts`

**Metrics to capture**:
- Time to first hydration
- Time to fully hydrated
- Number of components hydrated
- Main thread blocking time

**Expose via**:
- `window.__HYDRATION_METRICS__` (dev mode)
- Performance API markers

#### Step 3.7: Optimize React.lazy Boundaries

Ensure code splitting is optimal.

**Files to modify**:
- `src/framework/shared/routes-plugin.ts`

**Changes**:
- Group related components into same chunk
- Separate heavy dependencies (charts, editors) into own chunks
- Preload likely-needed chunks based on current route

### Testing Checklist for Phase 3

- [ ] TTI reduced to <300ms (measure with Lighthouse)
- [ ] Static components remain as HTML (no JS attached)
- [ ] Interactive components work after hydration
- [ ] Off-screen components hydrate when scrolled into view
- [ ] No hydration mismatch errors
- [ ] Bundle size reduced (measure before/after)
- [ ] Metrics available in dev mode

---

## Phase 4: Server Functions

### Goal

Create `serverFn()` primitive for type-safe server-only functions callable from client, with auto-generated secure endpoints.

### Implementation Steps

#### Step 4.1: Design serverFn API

Define the developer-facing API.

**Files to create**:
- `src/framework/shared/server-fn.ts`

**API design**:
```typescript
// Definition
export const getProducts = serverFn({
  input: z.object({
    category: z.string().optional(),
    limit: z.number().default(10),
  }),
  handler: async ({ input, request }) => {
    // Runs ONLY on server
    const products = await db.products.findMany({
      where: { category: input.category },
      take: input.limit,
    });
    return products;
  },
});

// Usage (works on both server and client)
const products = await getProducts({ category: "electronics" });
```

#### Step 4.2: Create Server Function Registry

Track all server functions for endpoint generation.

**Files to create**:
- `src/framework/server/fn-registry.ts`

**Contains**:
- `ServerFnRegistry` class
- `registerServerFn(id, handler)` 
- `getServerFn(id)` 
- `getAllServerFns()`

#### Step 4.3: Create Function ID Generator

Generate secure hash-based IDs for functions.

**Files to create**:
- `src/framework/shared/fn-id.ts`

**Logic**:
- Hash = SHA256(filePath + functionName + buildSalt)
- Truncate to 12 characters
- Example: `getProducts` → `fn_a3b4c5d6e7f8`

**Build salt**:
- Generated at build time
- Stored in environment
- Changes each build (prevents endpoint guessing)

#### Step 4.4: Create Build Plugin for Server Functions

Transform serverFn calls at build time.

**Files to create**:
- `src/framework/shared/server-fn-plugin.ts`

**Build-time transformation**:

Server bundle:
```typescript
// Before
export const getProducts = serverFn({ ... });

// After (server)
export const getProducts = serverFn({ 
  __id: "fn_a3b4c5d6e7f8",
  ... 
});
registry.register("fn_a3b4c5d6e7f8", getProducts);
```

Client bundle:
```typescript
// Before
export const getProducts = serverFn({ ... });

// After (client)
export const getProducts = createClientProxy("fn_a3b4c5d6e7f8", inputSchema);
```

#### Step 4.5: Create Client Proxy Generator

Generate client-side fetch wrappers.

**Files to create**:
- `src/framework/client/server-fn-proxy.ts`

**Contains**:
- `createClientProxy(fnId, inputSchema)`
- Returns async function that:
  1. Validates input with Zod
  2. Fetches `/__fn/${fnId}`
  3. Handles errors
  4. Returns typed response

#### Step 4.6: Create Server Function Endpoint Handler

Handle `/__fn/*` requests.

**Files to modify**:
- `src/framework/server/index.ts`

**New route**:
```
/__fn/:fnId → handleServerFnRequest()
```

**Files to create**:
- `src/framework/server/fn-handler.ts`

**Handler logic**:
1. Extract function ID from URL
2. Look up in registry
3. Validate input
4. Execute handler
5. Return JSON response

**Security checks**:
- Verify function ID exists (reject unknown IDs)
- Validate input schema
- Check request origin (CSRF protection)
- Rate limiting (optional)

#### Step 4.7: Add Request Context to Server Functions

Provide access to request info in handlers.

**Available context**:
```typescript
interface ServerFnContext {
  request: Request;
  headers: Headers;
  cookies: {
    get(name: string): string | undefined;
    set(name: string, value: string, options?: CookieOptions): void;
  };
}
```

**Usage**:
```typescript
export const getCurrentUser = serverFn({
  handler: async ({ request }) => {
    const token = request.headers.get("Authorization");
    return await validateToken(token);
  },
});
```

#### Step 4.8: Add Error Handling

Proper error handling for server functions.

**Files to create**:
- `src/framework/shared/server-fn-errors.ts`

**Error types**:
- `ServerFnValidationError` - input validation failed
- `ServerFnNotFoundError` - function ID not found
- `ServerFnExecutionError` - handler threw error

**Client receives**:
```typescript
interface ServerFnErrorResponse {
  error: true;
  code: "VALIDATION" | "NOT_FOUND" | "EXECUTION";
  message: string;
  details?: unknown; // Validation issues, stack in dev
}
```

#### Step 4.9: Generate Type Declarations

Ensure full type safety for server functions.

**Files to modify**:
- `build.ts`

**Generate at build**:
- `src/framework/shared/server-fns.generated.ts`
- Contains type declarations for all server functions
- Enables autocomplete and type checking

#### Step 4.10: Documentation and Examples

Create documentation for server functions.

**Files to create**:
- `docs/server-functions.md`

**Example patterns**:
- Basic CRUD operations
- Authentication checks
- File uploads
- Database transactions
- Error handling

### Testing Checklist for Phase 4

- [ ] serverFn works on server (direct call)
- [ ] serverFn works on client (becomes fetch)
- [ ] Input validation works
- [ ] Type safety preserved
- [ ] Unknown function IDs rejected
- [ ] Errors handled gracefully
- [ ] Request context available
- [ ] Build generates correct code
- [ ] No server code in client bundle

---

## Files Summary

### New Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `src/framework/shared/navigation-payload.ts` | 1 | Navigation payload types |
| `src/framework/server/hash.ts` | 1 | Hash generation |
| `src/framework/server/data-handler.ts` | 1 | /__data/* handler |
| `src/framework/client/navigation-state.ts` | 2 | Navigation state |
| `src/framework/client/fetch-route-data.ts` | 2 | Data fetcher |
| `src/framework/client/preload-chunks.ts` | 2 | Chunk preloader |
| `src/framework/client/head-manager.ts` | 2 | Head updater |
| `src/framework/client/navigation-progress.tsx` | 2 | Loading indicator |
| `src/framework/client/island-hydration.ts` | 3 | Selective hydration |
| `src/framework/client/hydration-metrics.ts` | 3 | Performance metrics |
| `src/framework/shared/server-fn.ts` | 4 | serverFn API |
| `src/framework/server/fn-registry.ts` | 4 | Function registry |
| `src/framework/shared/fn-id.ts` | 4 | ID generation |
| `src/framework/shared/server-fn-plugin.ts` | 4 | Build plugin |
| `src/framework/client/server-fn-proxy.ts` | 4 | Client proxy |
| `src/framework/server/fn-handler.ts` | 4 | /__fn/* handler |
| `src/framework/shared/server-fn-errors.ts` | 4 | Error types |

### Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `src/framework/shared/page.ts` | 1 | Add generateMetadata, redirect |
| `src/framework/shared/chunk-manifest.ts` | 1 | Enhanced manifest |
| `src/framework/server/index.ts` | 1, 4 | Add /__data/*, /__fn/* routes |
| `src/framework/shared/router.ts` | 2 | Remove clientNavigable |
| `src/framework/shared/routes-plugin.ts` | 2, 3 | Remove clientNavigable, optimize |
| `src/framework/shared/layout.ts` | 2 | Remove hasClientNavigation |
| `src/framework/client/router.tsx` | 2 | Complete rewrite |
| `src/framework/client/hydrate.tsx` | 2, 3 | Simplify, selective hydration |
| `src/components/link.tsx` | 2 | Simplify, add prefetch |
| `src/framework/server/render.tsx` | 3 | Add hydration markers |
| `build.ts` | 3, 4 | Optimize chunks, generate fn types |

### Files to Update (Examples/Docs)

| File | Changes |
|------|---------|
| `src/app/page.tsx` | Update navigation examples (see details below) |
| `src/app/demos/client-nav/*` | Repurpose demos (see details below) |
| `README.md` | Rewrite navigation section (see details below) |

---

## Documentation & Demo Updates

### README.md Changes

The README has a large section about client-side navigation (lines 440-530) that describes the **opt-in** `clientNavigation: true` pattern. This entire section needs rewriting.

**Current content to replace**:
```markdown
#### Client-Side Navigation

Enable SPA-style navigation for specific route groups using `defineLayout()` 
with `clientNavigation: true`. All child routes under that layout will use 
client-side navigation (no page reloads).
...
```

**New content should describe**:
1. Client-side navigation is now **default for all routes**
2. No layout configuration needed
3. `<Link>` component automatically uses SPA navigation
4. Prefetching behavior (on hover)
5. How to opt-out if needed (external links, etc.)

**Sections to update**:
- "Client-Side Navigation" section → Complete rewrite
- Feature checklist → Update status
- Architecture diagram → Update flow description

### src/app/page.tsx Changes

The home page has code examples showing the old `clientNavigation: true` pattern.

**Lines 46-52 - clientNavCode snippet**:
```typescript
const clientNavCode = `defineLayout({
  clientNavigation: true,
  component: ({ children }) => (
    <nav>...</nav>
    {children}
  )
})`;
```

**Should be replaced with**:
```typescript
const clientNavCode = `// Client navigation is automatic!
// Just use <Link> components
import { Link } from "@/components/link";

export default function Layout({ children }) {
  return (
    <nav>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/settings">Settings</Link>
    </nav>
    {children}
  )
}`;
```

**Lines 248-254 - Demo feature description**:
```typescript
{
  title: "Client-Side Navigation",
  description:
    "SPA-style navigation for route groups. Instant transitions without page reloads.",
  href: "/demos/client-nav",
  icon: "🚀",
},
```

**Should be updated to**:
```typescript
{
  title: "Client-Side Navigation",
  description:
    "Automatic SPA-style navigation. Instant transitions, prefetching, and smooth updates.",
  href: "/demos/client-nav",
  icon: "🚀",
},
```

### src/app/demos/client-nav/ Changes

The client-nav demo folder currently demonstrates the opt-in pattern. It should be **repurposed** to show:

1. **How navigation works** - Demonstrate instant page transitions
2. **Prefetching** - Show network tab behavior on hover
3. **Loading states** - Show optional loading indicators
4. **Back/forward** - Demonstrate browser history integration

**Files to modify**:

| File | Current Purpose | New Purpose |
|------|-----------------|-------------|
| `layout.tsx` | Shows `clientNavigation: true` | Remove config, keep layout structure |
| `page.tsx` | Basic demo page | Add navigation metrics/explainer |
| `settings/page.tsx` | Example subpage | Keep as-is (demonstrates transition) |
| `profile/page.tsx` | Example subpage | Keep as-is |
| `analytics/page.tsx` | Example subpage | Add timing metrics display |

**layout.tsx changes**:
```typescript
// BEFORE
export default defineLayout({
  clientNavigation: true,  // ← REMOVE THIS
  component: ({ children }) => ( ... )
});

// AFTER
export default function ClientNavLayout({ children }) {
  return (
    <div className="...">
      {/* Optional: Add NavigationProgress component */}
      <NavigationProgress />
      <aside>...</aside>
      <main>{children}</main>
    </div>
  );
}
```

### src/framework/shared/layout.ts Changes

The `defineLayout` function currently supports `clientNavigation` option. This needs to be:

1. **Deprecated** - Keep for one version with console.warn
2. **Then removed** - In subsequent update

**Migration path**:
```typescript
// Phase 1: Deprecation warning
export const defineLayout = (config) => {
  if (config.clientNavigation !== undefined) {
    console.warn(
      'defineLayout({ clientNavigation }) is deprecated. ' +
      'Client navigation is now automatic for all routes.'
    );
  }
  return config.component;
};

// Phase 2: Remove entirely
export const defineLayout = (config) => config.component;
// Or just remove defineLayout and use plain components
```

---

## Migration Notes

### Breaking Changes

1. **clientNavigable removed**: All routes now use client navigation
2. **Layout config changed**: Remove `clientNavigation: true` from layouts
3. **Link behavior changed**: Always prevents default, uses router

### Backwards Compatibility

- Existing loaders continue to work
- Page components unchanged
- API routes unchanged
- Static/dynamic page types unchanged

### Upgrade Path

1. Remove `clientNavigation: true` from layouts
2. Test all navigation works
3. Add `generateMetadata` to pages (optional)
4. Add loading indicators if desired

---

## Success Metrics

| Metric | Current | Target | Phase |
|--------|---------|--------|-------|
| Navigation type | Full reload | SPA | 2 |
| TTI | ~1000ms | <300ms | 3 |
| Bundle size | TBD | -30% | 3 |
| Server function DX | Manual API | Type-safe | 4 |

---

## Open Questions

1. Should prefetching be disabled on mobile/slow connections?
2. Should we support streaming JSON in future? (Phase 5?)
3. Should server functions support file uploads?
4. Should we add request caching for server functions?



---

## Why Suspense with Async Server Components Doesn't Work on Client Navigation

### The Core Problem

The `suspense/page.tsx` uses **async server components**:

```tsx
const AsyncData = async ({ delay }: { delay: number }) => {
  const data = await fetchData(delay);
  return <div>✅ {data}</div>;
};
```

**Fundamental constraint**: Async components (`async function`) can **ONLY execute on the server**. They cannot run in the browser because:

1. React's client-side renderer expects **synchronous** component functions
2. An `async function` returns a `Promise`, not a React element
3. React sees the Promise, treats it as "suspending", but the Promise doesn't resolve to a React element the way React expects

### Flow Comparison

| Step | Full Page Load ✅ | Client Navigation ❌ |
|------|------------------|---------------------|
| 1 | Browser requests `/demos/suspense` | User clicks Link |
| 2 | Server runs `renderToReadableStream` | Router fetches `/__data/demos/suspense` |
| 3 | Server executes async components | Router sets `currentRoute` |
| 4 | Server waits/streams resolved HTML | React tries to render `AsyncData` on client |
| 5 | Client hydrates static HTML | `AsyncData` returns Promise → Suspense fallback forever |

---

## Possible Solutions for Phase 5

### Solution 1: Server-Rendered HTML Injection (Recommended)

**Concept**: For routes with async server components, fetch **pre-rendered HTML** instead of trying to render on client.

**How it works**:
```
Client Navigation to /demos/suspense
  → Fetch /__html/demos/suspense (or extend /__data/ to include HTML)
  → Server renders full page HTML with streaming
  → Client receives HTML string
  → Client replaces #root innerHTML (or uses morphdom/idiomorph for smart diffing)
  → Re-attach event listeners for interactive elements
```

**Pros**:
- Works with any server component pattern (async, Suspense, etc.)
- Preserves streaming behavior conceptually (HTML arrives progressively)
- No changes to page components needed

**Cons**:
- Larger payload (HTML vs JSON)
- Need smart DOM diffing to avoid flicker
- Event listener re-attachment is complex

**Implementation sketch**:
```typescript
// In router.tsx navigate()
if (route.hasAsyncServerComponents) {
  const html = await fetch(`/__html${path}`).then(r => r.text());
  morphdom(document.getElementById('root'), html);
  reattachEventListeners();
}
```

---

### Solution 2: RSC-Lite Protocol (Similar to Next.js App Router)

**Concept**: Create a simplified "Flight-like" protocol that sends serialized React tree, not raw component functions.

**How it works**:
```
Client Navigation
  → Fetch /__rsc/demos/suspense
  → Server renders components, serializes output as JSON-like structure
  → Client receives serialized tree (not executable code)
  → Client reconstructs React elements from serialized data
```

**Payload example**:
```json
{
  "type": "div",
  "props": { "className": "space-y-8" },
  "children": [
    { "type": "h1", "props": {}, "children": ["Suspense Streaming"] },
    { 
      "type": "SuspenseResult",
      "key": "async-data-500",
      "resolved": true,
      "content": {
        "type": "div",
        "props": { "className": "rounded-lg..." },
        "children": ["✅ Data loaded after 500ms"]
      }
    }
  ]
}
```

**Pros**:
- Smaller than HTML
- Can handle partial updates
- Type-safe serialization possible

**Cons**:
- Complex to implement
- Need to handle all React element types
- Essentially reinventing RSC Flight (which has security issues)

---

### Solution 3: Hybrid Navigation Mode

**Concept**: Detect route capabilities and use different navigation strategies.

**Route types**:
1. **Client-renderable**: Regular components, `definePage` with loaders → JSON navigation
2. **Server-only**: Async components, Suspense streaming → Full page reload or HTML injection

**Implementation**:
```typescript
// In routes-plugin.ts or route discovery
interface RouteInfo {
  // ... existing fields ...
  hasAsyncComponents: boolean;  // Detected at build time
  requiresServerRender: boolean;
}

// In router.tsx navigate()
if (match.route.requiresServerRender) {
  // Option A: Full page reload
  window.location.href = path;
  
  // Option B: HTML injection
  const html = await fetch(`/__html${path}`);
  injectHTML(html);
}
```

**Pros**:
- Best of both worlds
- No changes to working routes
- Explicit behavior per route

**Cons**:
- Two code paths to maintain
- Detection of async components is tricky

---

### Solution 4: Convert Async Components to Loaders

**Concept**: Transform async server components pattern to `definePage` with `loader`.

**Before** (async component):
```tsx
const AsyncData = async ({ delay }) => {
  const data = await fetchData(delay);
  return <div>{data}</div>;
};

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AsyncData delay={500} />
    </Suspense>
  );
}
```

**After** (loader pattern):
```tsx
export default definePage({
  loader: async () => {
    const [fast, medium, slow] = await Promise.all([
      fetchData(500),
      fetchData(1500),
      fetchData(3000),
    ]);
    return { fast, medium, slow };
  },
  component: ({ data }) => (
    <div>
      <div>{data.fast}</div>
      <div>{data.medium}</div>
      <div>{data.slow}</div>
    </div>
  ),
});
```

**Pros**:
- Works with current router
- Simple, no new infrastructure
- Data fetching is centralized

**Cons**:
- Loses streaming benefit (all data loads before render)
- Requires rewriting existing pages
- Can't have independent loading states per section

---

### Solution 5: Streaming Data Protocol (Advanced)

**Concept**: Extend `/__data/` to support streaming JSON for async data.

**Protocol**:
```
GET /__data/demos/suspense
Content-Type: application/x-ndjson

{"type":"shell","html":"<div class='space-y-8'>..."}
{"type":"suspense","id":"async-500","status":"pending"}
{"type":"suspense","id":"async-1500","status":"pending"}
{"type":"suspense","id":"async-3000","status":"pending"}
{"type":"suspense","id":"async-500","status":"resolved","html":"<div>✅ Data loaded...</div>"}
{"type":"suspense","id":"async-1500","status":"resolved","html":"<div>✅ Data loaded...</div>"}
{"type":"suspense","id":"async-3000","status":"resolved","html":"<div>✅ Data loaded...</div>"}
{"type":"done"}
```

**Client behavior**:
1. Receive shell → render immediately
2. Receive pending markers → show placeholders
3. Receive resolved → inject HTML into placeholder

**Pros**:
- True progressive loading on client navigation
- Same UX as initial page load
- Works with existing Suspense patterns

**Cons**:
- Most complex to implement
- Need placeholder system on client
- Streaming JSON parsing required

---

## Recommendation for Phase 5

| Solution | Complexity | Benefit | Recommended |
|----------|-----------|---------|-------------|
| 1. HTML Injection | Medium | Works for all cases | ✅ **Start here** |
| 2. RSC-Lite | Very High | Elegant, small payload | ❌ Too complex |
| 3. Hybrid Mode | Low | Quick win | ✅ **Fallback option** |
| 4. Convert to Loaders | Low | No infra change | ⚠️ Loses streaming |
| 5. Streaming Data | High | Best UX | 🔄 Future enhancement |

### Suggested Phase 5 Plan

1. **Detect async/Suspense routes** at build time (add `hasAsyncComponents` to RouteInfo)
2. **Implement Solution 3 (Hybrid)** first - fallback to full reload for these routes
3. **Then implement Solution 1 (HTML Injection)** with smart DOM diffing
4. **Consider Solution 5** as Phase 6 for optimal streaming experience

---

## Quick Fix for Now

If you want the Suspense demo to work with client navigation **without Phase 5**, the simplest approach is to make it fall back to full page reload:

```typescript
// In Link component or router
const shouldFullReload = (path: string): boolean => {
  // Routes that need server rendering
  const serverOnlyRoutes = ['/demos/suspense'];
  return serverOnlyRoutes.some(r => path.startsWith(r));
};

// In navigate()
if (shouldFullReload(path)) {
  window.location.href = path;
  return;
}
```

Or update the Suspense demo to use the `definePage` loader pattern (Solution 4) - though this loses the streaming demonstration.

Would you like me to detail any of these solutions further?

---

