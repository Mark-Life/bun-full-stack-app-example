# Phase 0.2 Research: Current Framework Architecture Analysis

## Overview

This document maps the existing framework code that will need modification for RSC implementation. Each file is analyzed for its current functionality and the specific changes required for Flight protocol support.

---

## 1. Server Rendering (`src/framework/server/render.tsx`)

### Current Implementation

**Purpose**: Server-side HTML rendering with Suspense streaming support.

**Key Imports**:
```typescript
import { renderToReadableStream, renderToString } from "react-dom/server";
```

**Core Functions**:

| Function | Lines | Purpose |
|----------|-------|---------|
| `renderRoute()` | 646-765 | Main SSR rendering - returns Response with HTML stream |
| `renderRouteToString()` | 516-641 | Static generation - returns HTML string |
| `buildComponentTree()` | 315-382 | Builds React element tree with layouts |
| `loadLayouts()` | 236-286 | Loads layout components for a route |
| `createActiveStream()` | 450-511 | Wraps React stream for proper Suspense streaming |
| `hasClientComponents()` | 201-219 | Checks if route needs hydration |

**Data Flow**:
1. Route matched → `renderRoute()` called
2. Page module loaded from registry
3. Loader executed if present (lines 667-673)
4. Layouts loaded via `loadLayouts()`
5. Component tree built with `buildComponentTree()`
6. `renderToReadableStream()` called with `bootstrapModules: ["/hydrate.js"]`
7. Stream wrapped in `createActiveStream()` for proper Suspense handling
8. Response returned with `Content-Type: text/html`

**Key Observations**:
- Uses `SSRRoutePathProvider` to provide route path during SSR (line 354-360)
- Root layout (`app/layout.tsx`) renders `<html>` tags via `RootShell`
- HMR script injected directly in `RootShell` component
- Route data serialized as JSON in `__ROUTE_DATA__` script tag

### RSC Modifications Required

1. **New Flight Renderer**: Create `renderToFlightStream()` using `react-server-dom-esm/server`
2. **Module Map**: Pass `ClientManifest` (base URL string) to Flight renderer
3. **Client References**: Replace client component imports with `registerClientReference()` calls
4. **Dual Output Path**: Keep HTML rendering for initial load, add Flight-only path for navigation
5. **Flight Embedding**: Embed Flight payload in HTML shell (buffer or stream)

**New Functions Needed**:
- `renderRouteToFlight()` - Flight stream rendering
- `wrapFlightInHtml()` - Embed Flight in HTML shell
- `getClientManifest()` - Return base URL for client components

---

## 2. Client Hydration (`src/framework/client/hydrate.tsx`)

### Current Implementation

**Purpose**: Client-side hydration entry point - hydrates SSR content for interactivity.

**Key Imports**:
```typescript
import { hydrateRoot } from "react-dom/client";
import { routes } from "virtual:routes";
```

**Core Functions**:

| Function | Lines | Purpose |
|----------|-------|---------|
| `hydrate()` | 207-241 | Main entry - matches route and triggers hydration |
| `hydrateRoute()` | 255-343 | Hydrates specific route with layouts |
| `getRouteData()` | 161-179 | Reads `__ROUTE_DATA__` from DOM |
| `needsHydration()` | 185-202 | Checks if route requires hydration |
| `matchClientRoute()` | 124-156 | Matches URL to route config |

**Data Flow**:
1. Page loads → `hydrate()` called
2. Route data extracted from `__ROUTE_DATA__` script tag
3. Route matched against `routes` from virtual module
4. `needsHydration()` checks if hydration needed
5. `hydrateRoute()` builds component tree matching SSR
6. `hydrateRoot()` hydrates existing HTML

**Key Observations**:
- Server components skip hydration (line 233-238)
- Component tree must match SSR structure exactly
- Layouts applied in same order as server (outermost → innermost)
- `ClientNavigationProvider` enables SPA navigation within groups

### RSC Modifications Required

1. **New Entry Point**: Create `flight-client.tsx` using `createFromNodeStream`
2. **Flight Consumption**: Replace `hydrateRoot` with Flight stream consumption
3. **Module Resolver**: Create async loader for client component references
4. **Payload Extraction**: Extract Flight payload from HTML (inline or stream)
5. **Render Method**: Use `createRoot` instead of `hydrateRoot` (Flight renders fresh)

**New Files Needed**:
- `src/framework/client/flight-client.tsx` - Flight client entry
- `src/framework/client/module-resolver.ts` - Client module loading

**Challenge**: Flight doesn't "hydrate" - it renders fresh. Need dual output:
- HTML for initial paint/SEO
- Flight for React tree

---

## 3. RSC Detection (`src/framework/shared/rsc.ts`)

### Current Implementation

**Purpose**: Detects client components via `"use client"` directive or `clientComponent()` wrapper.

**Key Functions**:

| Function | Lines | Purpose |
|----------|-------|---------|
| `hasUseClientDirective()` | 50-61 | Checks file for client markers |
| `hasClientComponentUsage()` | 71-95 | Internal - checks content for patterns |
| `getComponentType()` | 106-107 | Returns "server" or "client" |
| `findClientBoundaries()` | 135-159 | Finds client imports in a file |
| `hasClientBoundariesSync()` | 234-257 | Sync version for route discovery |
| `extractImportPaths()` | 112-128 | Extracts import paths from content |

**Detection Patterns**:
```typescript
const USE_CLIENT_DIRECTIVE_REGEX = /^\s*["']use client["'];?\s*$/m;
const CLIENT_COMPONENT_REGEX = /clientComponent\s*\(/g;
```

**Key Observations**:
- Supports both `"use client"` (React convention) and `clientComponent()` wrapper
- Handles `@/` and `~/` aliases for import resolution
- Only checks first 200 chars for directive (performance)
- Used during route discovery to classify components

### RSC Modifications Required

1. **Manifest Generation**: Add function to generate client component manifest
2. **Module ID Generation**: Create stable IDs for each client component file
3. **Export Tracking**: Track all exports from client component files
4. **Path Resolution**: Ensure paths match Flight's `$$id` format

**New Functions Needed**:
```typescript
// Generate manifest of all client components
generateClientManifest(): ClientManifest

// Create stable module ID for a file
generateModuleId(filePath: string): string

// Get all exports from a client component file
getClientExports(filePath: string): string[]
```

**Manifest Output Format** (from research-0.1):
```typescript
// ClientManifest is just a base URL string
const manifest: ClientManifest = "/dist/client/";

// Client references use $$id format
// "fullURL#exportName" -> "/dist/client/components/Button.js#default"
```

---

## 4. Routes Plugin (`src/framework/shared/routes-plugin.ts`)

### Current Implementation

**Purpose**: Bun plugin that generates virtual `routes` module at build time.

**Key Functions**:

| Function | Lines | Purpose |
|----------|-------|---------|
| `generateComponentName()` | 20-52 | Creates unique PascalCase names |
| `toImportPath()` | 59-94 | Converts aliases to relative paths |
| `collectLayouts()` | 111-150 | Gathers all layouts and their types |
| `generateImports()` | 158-183 | Creates lazy import statements |
| `generateRouteConfig()` | 188-263 | Generates config for single route |
| `generateRoutesCode()` | 268-302 | Assembles complete module code |

**Plugin Setup** (lines 311-386):
- Intercepts `virtual:routes` imports
- Resolves `./src/` paths relative to `process.cwd()`
- Calls `discoverRoutes()` and generates TypeScript module

**Generated Output Structure**:
```typescript
import { lazy } from "react";

const BlogPage = lazy(() => import("./src/app/blog/page.tsx"));
const BlogLayout = lazy(() => import("./src/app/blog/layout.tsx"));

export const routes: Record<string, RouteConfig> = {
  "/blog": {
    component: BlogPage,
    componentType: "server",
    layout: BlogLayout,
    layoutType: "client",
    // ...
  }
};
```

**Key Observations**:
- ALL components lazy-loaded (server and client)
- Layout types tracked for hydration decisions
- `componentType` indicates server vs client
- `clientNavigable` flag for SPA navigation groups

### RSC Modifications Required

1. **Client Component References**: Generate Flight-compatible references
2. **Module ID Injection**: Include stable IDs in generated code
3. **Dual Generation**: Separate server and client route modules
4. **Manifest Integration**: Generate manifest alongside routes

**Changes to Generated Output**:
```typescript
// For RSC, client components need references:
import { registerClientReference } from "react-server-dom-esm";

// Instead of direct import:
const Button = registerClientReference(
  () => import("./src/components/Button.tsx"),
  "/dist/client/components/Button.js",
  "default"
);
```

---

## 5. Root Shell (`src/framework/shared/root-shell.tsx`)

### Current Implementation

**Purpose**: Root HTML shell component that wraps all pages.

**Key Types**:
```typescript
interface RouteData {
  routePath: string;
  hasClientComponents: boolean;
  pageData?: unknown;
}
```

**Key Functions**:

| Function | Lines | Purpose |
|----------|-------|---------|
| `serializeRouteData()` | 34-48 | JSON serialization with caching |
| `clearRouteDataCache()` | 53-55 | Clears cache for HMR |
| `RootShell` | 73-150 | Main shell component |

**Shell Structure**:
```html
<html lang="en">
  <head>
    <!-- meta, title, stylesheets -->
    <!-- process polyfill script -->
    <!-- modulepreload for hydration -->
    <!-- route chunk preloads -->
  </head>
  <body>
    <div id="root">{children}</div>
    <script id="__ROUTE_DATA__">{serializedRouteData}</script>
    <!-- hydration script via bootstrapModules -->
  </body>
</html>
```

**Key Observations**:
- Route data embedded as JSON in script tag
- Process polyfill injected for browser environment
- Chunk preloading for faster TTI
- Hydration script preloaded via `<link rel="modulepreload">`

### RSC Modifications Required

1. **Flight Payload Embedding**: Replace JSON route data with Flight payload
2. **Bootstrap Script**: Add Flight-specific bootstrap code
3. **Streaming Support**: Handle Flight chunks if streaming

**Options for Flight Embedding**:

| Option | Pros | Cons |
|--------|------|------|
| Buffer inline | Simple, single response | Larger initial HTML |
| Stream chunks | Progressive loading | More complex |
| Separate fetch | Parallel loading | Extra request |

**Recommended Approach** (Option A - Buffer inline):
```html
<script id="__FLIGHT_DATA__" type="text/x-component">
  {/* Flight payload as text */}
</script>
<script type="module">
  // Bootstrap: create stream from inline payload
  const flightData = document.getElementById('__FLIGHT_DATA__').textContent;
  // ... create ReadableStream, consume with Flight client
</script>
```

---

## 6. Client Router (`src/framework/client/router.tsx`)

### Current Implementation

**Purpose**: Client-side routing with context providers.

**Key Components/Functions**:

| Name | Lines | Purpose |
|------|-------|---------|
| `RouterProvider` | 389-428 | Basic router context |
| `ClientNavigationProvider` | 254-379 | SPA navigation within groups |
| `RouteParamsProvider` | 82-89 | Provides route params |
| `useRouter()` | 41-64 | Hook for navigation |
| `useParams()` | 69-72 | Hook for route params |
| `matchClientRoute()` | 182-214 | Route matching |

**Navigation Flow** (ClientNavigationProvider):
1. `navigate(path)` called
2. Route matched via `matchClientRoute()`
3. Check if target is `clientNavigable`
4. If yes: `pushState()` + update state + render new page
5. If no: Full page navigation (`window.location.href`)

**Current Re-render Strategy**:
```typescript
// On client-side navigation:
setNavigatedPage(match.route.component); // Sets lazy component
// Then renders in JSX:
<Suspense fallback={<div>Loading...</div>}>
  {React.createElement(navigatedPage, { params: currentParams })}
</Suspense>
```

**Key Observations**:
- Client re-renders entire page component on navigation
- Uses `Suspense` for lazy loading
- Layouts applied during re-render
- `popstate` handler for back/forward

### RSC Modifications Required

1. **RSC Fetch**: Fetch Flight payload instead of re-rendering
2. **Stream Consumption**: Use `createFromNodeStream` for response
3. **Loading States**: Show UI during Flight fetch
4. **Caching**: Cache Flight payloads for back/forward

**New Navigation Flow**:
```typescript
const navigate = async (path: string) => {
  setIsNavigating(true);
  
  // Fetch RSC payload from server
  const response = await fetch(`/_rsc${path}`);
  const flightStream = response.body;
  
  // Consume Flight stream
  const tree = await createFromReadableStream(flightStream, {
    moduleRootPath: "/dist/client/",
    moduleBaseURL: window.location.origin
  });
  
  // Update React tree
  setCurrentTree(tree);
  setIsNavigating(false);
};
```

---

## 7. Server Entry (`src/framework/server/index.ts`)

### Current Implementation

**Purpose**: Main server entry point using `Bun.serve()`.

**Key Sections**:

| Section | Lines | Purpose |
|---------|-------|---------|
| Bundle builders | 43-130 | Build hydrate.js and index.css |
| Chunk manifest | 140-160 | Load chunk manifest for preloading |
| API handlers | 176-183 | Load and wrap API routes |
| Route modules | 188-220 | Pre-load route modules |
| ISR handling | 380-455 | Cache-aware serving |
| Server config | 458-637 | Bun.serve() configuration |
| HMR | 641-658 | WebSocket upgrade for HMR |
| File watching | 860-958 | Dev mode file watcher |

**Request Routing** (wildcard `/*`):
1. Serve sourcemaps (`.map` files)
2. Serve code-split chunks (`.js` files from dist/)
3. Skip API/static paths
4. Try route handler (`route.ts`)
5. Try ISR cache
6. Try pre-rendered static HTML
7. Fall through to SSR via `matchAndRenderRoute()`
8. Render `not-found.tsx` if no match

**Key Observations**:
- ISR implemented with stale-while-revalidate pattern
- Route handlers take precedence over pages
- Static pages served from `dist/pages/`
- HMR uses WebSocket with pub/sub

### RSC Modifications Required

1. **RSC Endpoint**: Add `/_rsc/*` pattern or header-based detection
2. **Flight Response**: Return Flight stream instead of HTML
3. **Content Type**: Set `Content-Type: text/x-component` for RSC
4. **Request Detection**: Check `Accept` header or URL pattern

**RSC Endpoint Implementation**:
```typescript
// Option A: URL-based
"/_rsc/*": async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname.replace("/_rsc", "");
  
  const routeMatch = matchRoute(pathname);
  if (!routeMatch) {
    return new Response("Not Found", { status: 404 });
  }
  
  const flightStream = await renderRouteToFlight(routeMatch.route);
  return new Response(flightStream, {
    headers: { "Content-Type": "text/x-component" }
  });
}

// Option B: Header-based (in wildcard handler)
const acceptHeader = req.headers.get("Accept");
if (acceptHeader?.includes("text/x-component")) {
  // Return Flight response
}
```

---

## 8. Build Script (`build.ts`)

### Current Implementation

**Purpose**: Production build script with code splitting.

**Key Functions**:

| Function | Lines | Purpose |
|----------|-------|---------|
| `buildHydrateBundle()` | 573-651 | Client bundle with splitting |
| `buildServerBundle()` | 656-692 | Server bundle |
| `buildCssBundle()` | 697-746 | CSS with Tailwind |
| `copyPublicAssets()` | 452-494 | Copy src/public to dist |
| `generateChunkManifest()` | 500-566 | Route → chunks mapping |
| `preRenderStaticPages()` | 902-931 | Static page generation |

**Hydrate Bundle Config**:
```typescript
await Bun.build({
  entrypoints: ["./src/framework/client/hydrate.tsx"],
  outdir,
  splitting: true,
  plugins: [routesPlugin],
  target: "browser",
  minify: true,
  external: ["*.css"],
  define: { "process.env.NODE_ENV": '"production"' },
});
```

**Server Bundle Config**:
```typescript
await Bun.build({
  entrypoints: ["./src/framework/server/index.ts"],
  target: "bun",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
```

**Key Observations**:
- Client uses code splitting via `splitting: true`
- Chunks have content hashes for caching
- Server bundle is single file
- Chunk manifest maps routes to required chunks
- Static pages pre-rendered to `dist/pages/`

### RSC Modifications Required

1. **Client Manifest Generation**: Generate before bundling
2. **Dual Entry Points**: Separate entries for server/client
3. **Client Externalization**: Server bundle doesn't bundle client components
4. **Stable Chunk Names**: Ensure manifest IDs match output

**New Build Order**:
1. Discover routes and client components
2. Generate client component manifest
3. Build client bundle (uses manifest for stable IDs)
4. Build server bundle (uses manifest for references)
5. Pre-render static pages

**Manifest Generation Step**:
```typescript
const generateClientManifest = async () => {
  const clientComponents = await scanForClientComponents("./src");
  const manifest: Record<string, { id: string; exports: string[] }> = {};
  
  for (const filePath of clientComponents) {
    const id = generateStableId(filePath);
    const exports = await extractExports(filePath);
    manifest[filePath] = { id, exports };
  }
  
  await Bun.write("./dist/client-manifest.json", JSON.stringify(manifest));
  return manifest;
};
```

---

## Summary: Files to Modify

| File | Modification Type | Priority |
|------|------------------|----------|
| `src/framework/server/render.tsx` | Major - Add Flight rendering | High |
| `src/framework/client/hydrate.tsx` | Major - New Flight client | High |
| `src/framework/shared/rsc.ts` | Enhance - Manifest generation | High |
| `src/framework/shared/routes-plugin.ts` | Modify - Module references | High |
| `src/framework/shared/root-shell.tsx` | Modify - Flight embedding | Medium |
| `src/framework/client/router.tsx` | Major - RSC fetch | Medium |
| `src/framework/server/index.ts` | Add - RSC endpoint | Medium |
| `build.ts` | Major - Dual bundling | High |

## New Files to Create

| File | Purpose |
|------|---------|
| `src/framework/build/client-manifest.ts` | Client component manifest generation |
| `src/framework/server/flight-renderer.ts` | Flight rendering logic |
| `src/framework/server/module-map.ts` | Server-side module resolution |
| `src/framework/server/rsc-endpoint.ts` | RSC route handler |
| `src/framework/client/flight-client.tsx` | Flight consumption entry |
| `src/framework/client/module-resolver.ts` | Client module loading |

---

## Data Flow Comparison

### Current (SSR)

```
[Server]
Route Match → Load Module → Execute Loader → Build Tree → renderToReadableStream → HTML

[Client - Initial]
Load HTML → Parse __ROUTE_DATA__ → Match Route → hydrateRoot → Interactive

[Client - Navigation]
Click Link → Match Route → Load Component → Re-render → Update DOM
```

### Target (RSC)

```
[Server]
Route Match → Load Module → Execute Loader → Build Tree → renderToPipeableStream → Flight

[Client - Initial]
Load HTML → Parse __FLIGHT_DATA__ → createFromReadableStream → Resolve Modules → Render

[Client - Navigation]
Click Link → Fetch /_rsc/path → createFromReadableStream → Resolve Modules → Update Tree
```

---

## Key Architectural Decisions Pending

| Decision | Options | Recommendation |
|----------|---------|----------------|
| RSC endpoint pattern | URL (`/_rsc/`) vs Header | URL-based (simpler) |
| Flight in HTML | Buffer vs Stream | Buffer (simpler) |
| Initial HTML | Dual (HTML+Flight) vs Flight-only | Dual (SEO) |
| RSC caching | None / Memory / Browser | Memory with TTL |
| Rendering mode API | Page config vs File convention | Page config (existing pattern) |

---

## Notes

1. **Bun Compatibility**: Node.js streams work in Bun (verified in research-0.1)
2. **Module Map Format**: Just a base URL string (simpler than expected)
3. **Security**: React 19.2.1 addresses CVE-2025-55182
4. **Package Status**: `react-server-dom-esm` is placeholder on npm - need to build from React source

## Next Steps

- [ ] Phase 0.3: Set up test routes for RSC experimentation
- [ ] Phase 1.1: Understand current build system in detail
- [ ] Phase 1.2: Create client component manifest generator

