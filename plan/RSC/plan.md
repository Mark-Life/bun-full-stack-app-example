# RSC Flight Protocol Implementation Plan

## Overview

This plan outlines the implementation of true React Server Components (RSC) with the Flight wire protocol for the Bun + React framework. The goal is to replace the current "SSR + selective hydration" approach with proper RSC streaming.

### Current State
- Server rendering uses `react-dom/server` (`renderToReadableStream`, `renderToString`)
- Data is passed via JSON in `<script id="__ROUTE_DATA__">` tags
- Client hydration uses `hydrateRoot` from `react-dom/client`
- Client-side navigation re-renders components entirely on client
- `"use client"` detection exists but is only used for hydration optimization

### Target State
- Server rendering uses `react-server-dom-esm/server` (Flight protocol)
- Data and component trees stream via Flight wire format
- Client uses `createFromReadableStream` to consume Flight payloads
- Client-side navigation fetches RSC payloads from server
- True server/client component boundary enforcement

### Key Dependencies
- `react-server-dom-esm` (bundler-agnostic Flight implementation)
- React 19+ (already installed)
- Bun bundler (already used)

---

## Phase 0: Research and Preparation

### 0.1 Study react-server-dom-esm Package

**Goal**: Understand the API surface and requirements of the ESM Flight implementation.

**Tasks**:
- [ ] Install `react-server-dom-esm` and examine its exports
- [ ] Study the server-side API (`renderToReadableStream`, `renderToPipeableStream`)
- [ ] Study the client-side API (`createFromFetch`, `createFromReadableStream`)
- [ ] Understand the module map/manifest format it expects
- [ ] Document any Bun-specific compatibility issues

**Decision Point**: If `react-server-dom-esm` has compatibility issues with Bun, we may need to:
- a) Patch the package for Bun compatibility
- b) Use `react-server-dom-webpack` with a compatibility layer
- c) Fork and modify for Bun

**Resources**:
- React repository: `packages/react-server-dom-esm/`
- Next.js implementation for reference patterns

### 0.2 Study Current Framework Architecture

**Goal**: Map existing code that will need modification.

**Relevant Files**:
| File | Purpose | RSC Impact |
|------|---------|------------|
| `src/framework/server/render.tsx` | Server-side HTML rendering | Replace with Flight rendering |
| `src/framework/client/hydrate.tsx` | Client hydration entry | Replace with Flight consumption |
| `src/framework/shared/rsc.ts` | Client component detection | Enhance for manifest generation |
| `src/framework/shared/routes-plugin.ts` | Virtual routes generation | Add module reference generation |
| `src/framework/shared/root-shell.tsx` | HTML shell with route data | Modify for Flight bootstrap |
| `src/framework/client/router.tsx` | Client-side navigation | Add RSC payload fetching |
| `src/framework/server/index.ts` | Main server entry | Add RSC endpoint |
| `build.ts` | Production build script | Add dual bundling |

### 0.3 Tests

**Tasks**:
- [ ] Set up test routes for RSC experimentation
- [ ] Create minimal reproduction cases for testing

---

## Phase 1: Dual Bundling Infrastructure

RSC requires separate bundles for server and client code. Server components must NOT be bundled into the client bundle, and client components need stable module IDs.

### 1.1 Understand Current Build System

**Relevant Files**:
- `build.ts` - Main build script (lines 573-651 for hydrate bundle, 656-692 for server bundle)
- `src/framework/shared/routes-plugin.ts` - Virtual module generation

**Current Behavior**:
- Single client bundle (`hydrate.js`) with code splitting
- Server bundle (`server.js`) includes all server code
- Routes plugin generates lazy imports for all pages/layouts

### 1.2 Create Client Component Manifest Generator

**Goal**: At build time, generate a manifest mapping client component file paths to stable module IDs.

**New Files to Create**:
- `src/framework/build/client-manifest.ts` - Manifest generation logic
- `src/framework/shared/client-manifest.generated.ts` - Generated manifest (gitignored)

**Tasks**:
- [ ] Create function to scan codebase for `"use client"` files
- [ ] Generate stable module IDs (hash of file path or incremental)
- [ ] Output manifest as JSON and TypeScript module
- [ ] Integrate into `build.ts`

**Manifest Format (to be determined)**:
```typescript
// Option A: Simple path -> ID mapping
{
  "src/components/Counter.tsx": "c1",
  "src/components/ui/button.tsx": "c2"
}

// Option B: Include chunk information
{
  "src/components/Counter.tsx": {
    id: "c1",
    chunks: ["chunk-abc123.js"],
    exports: ["default", "Counter"]
  }
}
```

**Decision Point**: Manifest format depends on how `react-server-dom-esm` resolves module references. Research in Phase 0.1 will inform this.

**Reference**: Current client detection logic in `src/framework/shared/rsc.ts`:
- `hasUseClientDirective()` - checks for `"use client"` directive
- `findClientBoundaries()` - finds client component imports

### 1.3 Modify Client Bundle Build

**Goal**: Client bundle should only include client components, with stable chunk names for manifest matching.

**File to Modify**: `build.ts` (lines 573-651)

**Tasks**:
- [ ] Create separate entry point for client components only
- [ ] Configure Bun bundler for stable output names (content hashing)
- [ ] Ensure chunk names match manifest IDs
- [ ] Handle dynamic imports for lazy loading

**Challenge**: Bun's bundler output file naming
- Current: `hydrate.js` + auto-generated chunk names
- Needed: Predictable chunk names that match manifest

**Possible Approaches**:
- a) Use content hashing and update manifest post-build
- b) Configure Bun's `naming` option for chunks
- c) Post-process chunks to rename/map them

**Research Needed**: Bun bundler options for chunk naming
- Check `node_modules/bun-types/docs/bundler.md` for configuration options

### 1.4 Create Server Components Bundle

**Goal**: Server bundle should include server components but NOT bundle client components (only their references).

**Tasks**:
- [ ] Create server-side entry point that imports server components
- [ ] Configure build to externalize client components
- [ ] Replace client component imports with manifest references
- [ ] Ensure async server components work correctly

**New Files**:
- `src/framework/server/rsc-entry.ts` - RSC server entry point

**Decision Point**: How to handle client component imports in server bundle
- Option A: Bun plugin that transforms imports to manifest lookups
- Option B: Build-time code transformation
- Option C: Runtime module resolution

### 1.5 Integrate Dual Builds

**File to Modify**: `build.ts`

**Tasks**:
- [ ] Add manifest generation step (before bundles)
- [ ] Build client bundle with manifest-aware configuration
- [ ] Build server bundle with client externalization
- [ ] Ensure manifest is available at runtime
- [ ] Update chunk manifest generation (lines 500-566)

**Build Order**:
1. Discover routes and client components
2. Generate client component manifest
3. Build client bundle (uses manifest for stable IDs)
4. Build server bundle (uses manifest for references)
5. Pre-render static pages (if applicable)

---

## Phase 2: Server-Side Flight Rendering

### 2.1 Set Up react-server-dom-esm Server

**Goal**: Replace `renderToReadableStream` from `react-dom/server` with Flight rendering.

**File to Modify**: `src/framework/server/render.tsx`

**Current Implementation** (lines 2, 516-575, 646-765):
```typescript
import { renderToReadableStream, renderToString } from "react-dom/server";
// ... renders to HTML stream
```

**Target Implementation**:
```typescript
import { renderToReadableStream } from "react-server-dom-esm/server";
// ... renders to Flight stream
```

**Tasks**:
- [ ] Create new `renderToFlightStream()` function
- [ ] Set up module map/bundler config for `react-server-dom-esm`
- [ ] Handle client component references in output
- [ ] Preserve existing `renderRouteToString()` for static generation (or adapt)

### 2.2 Create Module Map for Server

**Goal**: Server needs a map to resolve client component references.

**New File**: `src/framework/server/module-map.ts`

**Tasks**:
- [ ] Load client manifest at server startup
- [ ] Create module map in format expected by `react-server-dom-esm`
- [ ] Handle module resolution for client boundaries

**Format (research needed)**:
```typescript
// react-server-dom-esm expects something like:
const moduleMap = {
  "c1": {
    id: "c1",
    chunks: ["/chunk-abc123.js"],
    name: "default"
  }
};
```

### 2.3 Handle Async Server Components

**Goal**: Ensure async server components work with Flight streaming.

**Current Support**: `renderToReadableStream` from `react-dom/server` already handles async components with Suspense.

**Tasks**:
- [ ] Verify async components work with Flight `renderToReadableStream`
- [ ] Test Suspense boundaries in Flight output
- [ ] Handle streaming of resolved promises

**Test Cases**:
- Async data fetching in server components
- Nested Suspense boundaries
- Error boundaries

### 2.4 Create RSC Endpoint

**Goal**: Add server endpoint that returns Flight payloads (for client navigation).

**File to Modify**: `src/framework/server/index.ts`

**Tasks**:
- [ ] Add `/_rsc/*` route pattern for RSC requests
- [ ] Detect RSC requests via header (`Accept: text/x-component`) or query param
- [ ] Return Flight stream instead of HTML for RSC requests
- [ ] Handle route params in RSC requests

**Endpoint Behavior**:
```
GET /blog/post-1           -> HTML (initial page load)
GET /_rsc/blog/post-1      -> Flight payload (client navigation)
```

**Alternative**: Use `Accept` header to distinguish
```
GET /blog/post-1
  Accept: text/html        -> HTML response
  Accept: text/x-component -> Flight response
```

**Decision Point**: URL-based (`/_rsc/`) vs header-based detection
- URL-based: Simpler, easier to debug, cacheable
- Header-based: Cleaner URLs, matches Next.js approach

### 2.5 Preserve HTML Rendering Path

**Goal**: Keep HTML rendering for initial page loads (Flight wrapped in HTML shell).

**Current Flow**:
1. Server renders component tree to HTML
2. Injects `<script id="__ROUTE_DATA__">` with JSON
3. Client hydrates with `hydrateRoot`

**New Flow**:
1. Server renders component tree to Flight stream
2. Wraps Flight in HTML shell with bootstrap script
3. Injects Flight payload inline or streams it
4. Client consumes Flight with `createFromReadableStream`

**File to Modify**: `src/framework/shared/root-shell.tsx`

**Tasks**:
- [ ] Modify `RootShell` to embed Flight payload instead of JSON route data
- [ ] Add Flight bootstrap script
- [ ] Handle streaming: either inline or via `<script>` chunks

**Challenge**: How to embed Flight stream in HTML
- Option A: Buffer entire Flight payload, embed as JSON
- Option B: Stream Flight chunks as inline `<script>` tags
- Option C: Initial HTML shell, then stream Flight separately

---

## Phase 3: Client-Side Flight Consumption

### 3.1 Create Flight Client Entry Point

**Goal**: Replace current hydration with Flight consumption.

**File to Modify**: `src/framework/client/hydrate.tsx`

**Current Implementation** (lines 200-317):
```typescript
import { hydrateRoot } from "react-dom/client";
// ... matches route, builds component tree, hydrates
```

**Target Implementation**:
```typescript
import { createFromReadableStream } from "react-server-dom-esm/client";
// ... consumes Flight payload, renders
```

**Tasks**:
- [ ] Create new entry point `src/framework/client/flight-client.tsx`
- [ ] Implement Flight stream consumption
- [ ] Set up module resolution for client components
- [ ] Handle initial render from embedded Flight payload

### 3.2 Create Client Module Resolver

**Goal**: Client needs to resolve module references (`$L1`) to actual component modules.

**New File**: `src/framework/client/module-resolver.ts`

**Tasks**:
- [ ] Load client manifest (embedded or fetched)
- [ ] Create async module loader for each manifest entry
- [ ] Handle dynamic imports for lazy loading
- [ ] Cache loaded modules

**Implementation**:
```typescript
// When Flight parser encounters $L1, it calls:
const moduleResolver = async (id: string) => {
  const manifest = getClientManifest();
  const entry = manifest[id];
  const module = await import(entry.chunks[0]);
  return module[entry.name];
};
```

### 3.3 Handle Initial Page Load

**Goal**: On initial page load, consume embedded Flight payload.

**Tasks**:
- [ ] Extract Flight payload from HTML (inline script or stream)
- [ ] Create ReadableStream from payload
- [ ] Pass to `createFromReadableStream`
- [ ] Render result with `createRoot` (not `hydrateRoot`)

**Challenge**: Flight doesn't "hydrate" existing HTML - it renders fresh
- Current SSR: Server renders HTML, client hydrates same tree
- RSC: Server sends Flight, client renders from Flight

**Possible Approaches**:
- a) Dual output: HTML for SEO/initial paint + Flight for React tree
- b) Flight-only: No initial HTML, client renders everything
- c) Hybrid: Minimal HTML shell, Flight for content

**Decision Point**: This affects SEO and initial paint performance. Research how Next.js handles this.

### 3.4 Integrate with Existing Router

**Goal**: Current router should work with Flight-rendered content.

**File to Modify**: `src/framework/client/router.tsx`

**Current Behavior** (lines 241-370):
- `AppRouter` manages navigation state
- On navigation, re-renders component tree on client
- Uses lazy-loaded components from virtual routes

**New Behavior**:
- On navigation, fetch RSC payload from server
- Consume Flight stream and update React tree
- Preserve router context and state

**Tasks**:
- [ ] Keep `AppRouter` structure but change rendering method
- [ ] Add Flight payload fetching on navigation
- [ ] Handle streaming responses during navigation
- [ ] Show loading states during Flight fetch

---

## Phase 4: Client Navigation with RSC

### 4.1 Implement RSC Fetch on Navigation

**Goal**: When user navigates, fetch RSC payload instead of re-rendering on client.

**File to Modify**: `src/framework/client/router.tsx`

**Current `navigate` function** (lines 255-277):
```typescript
const navigate = (path: string) => {
  // ... client-side only rendering
  setCurrentRoute(match.route);
  setIsNavigating(true);
  setNavigatedRoute(match.route);
};
```

**New Implementation**:
```typescript
const navigate = async (path: string) => {
  setIsNavigating(true);
  const response = await fetch(`/_rsc${path}`, {
    headers: { 'Accept': 'text/x-component' }
  });
  const flightStream = response.body;
  const tree = await createFromReadableStream(flightStream, moduleResolver);
  // Update React tree with new content
};
```

**Tasks**:
- [ ] Create `fetchRSCPayload()` function
- [ ] Integrate with router's navigate function
- [ ] Handle loading states during fetch
- [ ] Handle errors and fallbacks

### 4.2 Handle Streaming During Navigation

**Goal**: Show content progressively as Flight stream arrives.

**Tasks**:
- [ ] Use Suspense boundaries for streaming
- [ ] Show loading UI while streaming
- [ ] Handle partial updates

**Challenge**: React's Flight client can handle streaming, but integration with router state is complex.

### 4.3 Preserve Scroll Position and Focus

**Goal**: Maintain UX during RSC navigation.

**Tasks**:
- [ ] Save scroll position before navigation
- [ ] Restore after RSC render completes
- [ ] Handle focus management

### 4.4 Handle Back/Forward Navigation

**File to Modify**: `src/framework/client/router.tsx` (lines 279-301)

**Tasks**:
- [ ] Cache RSC payloads for visited routes
- [ ] On popstate, use cached payload if available
- [ ] Otherwise fetch fresh RSC payload

**Decision Point**: RSC payload caching strategy
- a) No caching - always fetch fresh
- b) Memory cache with TTL
- c) Browser cache (Cache API)
- d) Hybrid based on route configuration

---

## Phase 5: Build System Integration

### 5.1 Update Development Server

**Goal**: Development server should support RSC without full rebuild.

**File to Modify**: `src/framework/server/index.ts`

**Tasks**:
- [ ] Generate client manifest on startup
- [ ] Watch for `"use client"` file changes
- [ ] Regenerate manifest on changes
- [ ] Hot reload with RSC (research: does HMR work with Flight?)

**Current HMR** (lines 868-968):
- Watches `src/app` for route changes
- Sends WebSocket updates to client
- Client reloads page

**New HMR Approach** (research needed):
- RSC changes should trigger Flight re-render
- Client should consume new Flight payload without full reload
- May require RSC-aware HMR protocol

### 5.2 Update Production Build

**File to Modify**: `build.ts`

**Tasks**:
- [ ] Integrate manifest generation into build pipeline
- [ ] Ensure client chunks have stable names
- [ ] Verify server bundle has correct client references
- [ ] Test static page generation with Flight

### 5.3 Static Page Generation with RSC

**Current**: `renderRouteToString()` generates HTML at build time

**Challenge**: RSC changes the rendering model. Options:
- a) Keep HTML generation for static pages
- b) Generate Flight payloads at build time
- c) Hybrid: HTML shell + embedded Flight

**File**: `build.ts` (lines 902-931 for static page pre-rendering)

**Tasks**:
- [ ] Decide on static generation strategy
- [ ] Implement chosen approach
- [ ] Test ISR with RSC (lines 231-277 for ISR in `index.ts`)

---

## Phase 6: Server Actions (Final Phase)

Server Actions allow client components to call server functions directly. This is implemented on top of the Flight protocol.

### 6.1 Research Server Actions Protocol

**Goal**: Understand how Server Actions work with Flight.

**Tasks**:
- [ ] Study `react-server-dom-esm` server action APIs
- [ ] Understand the request/response format
- [ ] Document security considerations

### 6.2 Create Server Action Handler

**Goal**: Handle POST requests for server actions.

**New File**: `src/framework/server/actions.ts`

**Tasks**:
- [ ] Create endpoint for server action invocation
- [ ] Parse action ID and arguments from request
- [ ] Execute server function
- [ ] Return Flight response with result

**Endpoint**:
```
POST /_rsc
Content-Type: application/x-www-form-urlencoded
  or multipart/form-data
  or application/json

Body: Action ID + serialized arguments
Response: Flight payload with action result
```

### 6.3 Client-Side Action Invocation

**Goal**: Client can call server actions seamlessly.

**Tasks**:
- [ ] Create action reference system (like module references)
- [ ] Implement action caller on client
- [ ] Handle action responses (revalidation, redirect, etc.)

### 6.4 Form Integration

**Goal**: Forms should work with server actions.

**Tasks**:
- [ ] Support `action` prop on forms
- [ ] Handle progressive enhancement
- [ ] Show pending states during action execution

### 6.5 Security Hardening

**Tasks**:
- [ ] Validate action IDs (only allow registered actions)
- [ ] Implement CSRF protection
- [ ] Sanitize action arguments
- [ ] Rate limiting for actions

**Reference**: CVE-2025-55182 - RCE vulnerability in Flight deserialization. Ensure proper input validation.

---

## Appendix A: File Reference Map

### Core Framework Files

| File | Purpose | RSC Modifications |
|------|---------|-------------------|
| `src/framework/server/render.tsx` | Server rendering | Replace with Flight rendering |
| `src/framework/server/index.ts` | Server entry | Add RSC endpoint |
| `src/framework/client/hydrate.tsx` | Client entry | Replace with Flight client |
| `src/framework/client/router.tsx` | Client routing | Add RSC payload fetching |
| `src/framework/shared/rsc.ts` | RSC utilities | Enhance for manifest |
| `src/framework/shared/routes-plugin.ts` | Build plugin | Add module references |
| `src/framework/shared/root-shell.tsx` | HTML shell | Embed Flight payload |
| `build.ts` | Build script | Add dual bundling |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/framework/build/client-manifest.ts` | Manifest generation |
| `src/framework/server/flight-renderer.ts` | Flight rendering |
| `src/framework/server/module-map.ts` | Server module resolution |
| `src/framework/server/rsc-endpoint.ts` | RSC route handler |
| `src/framework/server/actions.ts` | Server actions handler |
| `src/framework/client/flight-client.tsx` | Flight consumption |
| `src/framework/client/module-resolver.ts` | Client module resolution |

---

## Appendix B: Decision Points Summary

| ID | Decision | Options | Default Assumption |
|----|----------|---------|-------------------|
| D1 | `react-server-dom-esm` compatibility | Patch / Adapt webpack / Fork | Use as-is, patch if needed |
| D2 | Manifest format | Simple / With chunks | Determine from ESM package API |
| D3 | Chunk naming | Content hash / Configured | Content hash + manifest update |
| D4 | Client imports in server | Plugin / Transform / Runtime | Bun plugin |
| D5 | RSC endpoint pattern | URL-based / Header-based | URL-based (`/_rsc/`) |
| D6 | Flight embedding in HTML | Buffer / Stream / Separate | Buffer inline |
| D7 | Initial HTML rendering | Dual output / Flight-only / Hybrid | Dual output for SEO |
| D8 | RSC caching | None / Memory / Browser | Memory with TTL |
| D9 | Static generation | HTML / Flight / Hybrid | Keep HTML for static |
| D10 | Rendering mode API | Config export / File convention / Directory | Config export (extends pageConfig) |
| D11 | Layout rendering mode | Independent / Inherit from page | Inherit from page |
| D12 | Default rendering mode | SSR / RSC | SSR (backward compatible) |

---

## Appendix C: Testing Strategy

### Unit Tests
- Manifest generation
- Module resolution (server and client)
- Flight serialization/deserialization

### Integration Tests
- Full page render with RSC
- Client navigation with RSC fetch
- Server actions invocation

### E2E Tests
- Initial page load with Flight
- Client-side navigation
- Back/forward navigation
- Form submissions with actions

### Performance Tests
- Time to First Byte (TTFB)
- Time to Interactive (TTI)
- Flight payload sizes
- Streaming performance

---

## Appendix D: Rendering Mode API Design

The framework should support both SSR and RSC as first-class rendering modes. Developers choose per-route or globally based on their needs.

### Decision Point: API Surface

**Option A: Page Config Export**
```typescript
// src/app/blog/page.tsx
export const config = {
  rendering: 'rsc', // or 'ssr'
};

export default function BlogPage() { ... }
```

**Option B: File Convention**
```
src/app/blog/page.tsx      -> SSR (default, backward compatible)
src/app/blog/page.rsc.tsx  -> RSC
```

**Option C: Directory Convention**
```
src/app/(ssr)/blog/page.tsx   -> SSR
src/app/(rsc)/dashboard/page.tsx -> RSC
```

**Option D: Global Config + Per-Route Override**
```typescript
// framework.config.ts (or similar)
export default {
  defaultRendering: 'ssr', // or 'rsc'
};

// Individual routes can override via page config
export const config = { rendering: 'rsc' };
```

### Considerations for API Design

| Aspect | Notes |
|--------|-------|
| Backward Compatibility | Existing pages should work without changes (SSR default) |
| Discoverability | Should be obvious which mode a route uses |
| Type Safety | Config should be typed, IDE autocomplete |
| Flexibility | Mix modes within same app freely |
| Layouts | Can a layout be RSC while page is SSR? (complex) |

### Layout + Page Mode Combinations

| Layout Mode | Page Mode | Supported? | Notes |
|-------------|-----------|------------|-------|
| SSR | SSR | Yes | Current behavior |
| RSC | RSC | Yes | Full RSC |
| RSC | SSR | Maybe | RSC layout wraps SSR page - needs research |
| SSR | RSC | No | SSR can't wrap Flight payload |

**Decision Point**: Should layouts have independent rendering mode, or inherit from page?
- Simpler: Layout inherits page's rendering mode
- Flexible: Layout can specify own mode (complex edge cases)

### Runtime Detection

Framework needs to know at:
1. **Build time**: Which bundles to generate
2. **Request time**: Which renderer to use
3. **Client time**: Which hydration strategy

**Implementation Approach**:
```typescript
// Route discovery adds rendering mode
interface RouteInfo {
  // ... existing fields
  renderingMode: 'ssr' | 'rsc';
}

// Server selects renderer based on mode
const renderer = routeInfo.renderingMode === 'rsc' 
  ? renderToFlightStream 
  : renderToHtmlStream;
```

### Client Behavior by Mode

| Mode | Initial Load | Client Navigation |
|------|--------------|-------------------|
| SSR | HTML + hydrate | Re-render on client (current) |
| RSC | HTML + Flight | Fetch RSC payload from server |
| Mixed | Depends on target route | Detect mode, use appropriate strategy |

### Tasks for API Design

- [ ] Decide on primary API (config export vs file convention)
- [ ] Define TypeScript types for config
- [ ] Handle layout/page mode combinations
- [ ] Update route discovery to detect rendering mode
- [ ] Update both renderers to check mode
- [ ] Update client to handle mixed navigation
- [ ] Document API for framework users

### Recommended Default Approach

Based on your current codebase patterns:

**Primary**: Page config export (matches existing `pageConfig` pattern)
```typescript
// Extends existing page config pattern from src/framework/shared/page.ts
export const pageConfig = {
  rendering: 'rsc',
  loader: async (params) => { ... },
  // ... other config
};
```

**Global default**: SSR (backward compatible)

**Layout behavior**: Inherits from page (simpler, less edge cases)

This aligns with the existing `pageConfig` pattern in your framework while adding the new capability.

---

## Appendix E: External Resources

### Documentation
- React Server Components RFC
- `react-server-dom-esm` source code
- Bun bundler documentation (`node_modules/bun-types/docs/bundler.md`)

### Reference Implementations
- Next.js App Router (uses `react-server-dom-webpack`)
- Remix (different approach, good for comparison)
- Waku (minimal RSC framework)

### Security
- CVE-2025-55182: Flight deserialization RCE
- React security advisories

