<!-- 6c97cb50-23c9-456a-94f4-7b013601667f d8730312-50a6-4635-8599-8a17ec1a70f8 -->
# PPR / Cache Components Implementation

## Architecture Overview

Pages will render in three tiers:

1. **Static** - Pure components, automatically in shell
2. **Cached** - Async components wrapped in `cacheComponent()`, executed at build/first-request, included in shell
3. **Dynamic** - Components inside `<Suspense>`, streamed at request time

## Phase 1: Cache Primitives

Create new cache utilities in [`bun-react/src/framework/shared/cache.ts`](bun-react/src/framework/shared/cache.ts):

```typescript
export interface CacheConfig {
  stale?: number;      // seconds until stale (default: 3600)
  revalidate?: number; // seconds until background revalidate
  expire?: number;     // seconds until hard expire
  tag?: string;        // cache tag for invalidation
}

export const cacheComponent = <P>(
  Component: React.ComponentType<P>,
  config?: CacheConfig
): CachedComponent<P>;

export const hasCacheConfig = (c: unknown): c is CachedComponent<unknown>;
export const getCacheConfig = (c: CachedComponent<unknown>): CacheConfig;
```

## Phase 2: Component Cache Storage

Extend [`bun-react/src/framework/server/cache.ts`](bun-react/src/framework/server/cache.ts):

- Add `ComponentCacheEntry` type (HTML fragment + metadata)
- Add `getComponentCache(componentId, props)` and `setComponentCache()`
- Store in `dist/cache/components/{hash}.json`
- Props become part of cache key (hashed)

## Phase 3: Shell Extraction at Build Time

Modify [`bun-react/build.ts`](bun-react/build.ts):

- Add `extractShell()` function that:

  1. Walks component tree to find `cacheComponent` wrappers
  2. Executes cached components, stores their HTML
  3. Replaces Suspense children with placeholder markers
  4. Outputs shell to `dist/shells/{path}.html`

## Phase 4: Modify Rendering

Update [`bun-react/src/framework/server/render.tsx`](bun-react/src/framework/server/render.tsx):

- Add `renderWithCache()` that:

  1. Checks for cached component results before rendering
  2. Injects cached HTML for `cacheComponent` wrapped components
  3. Streams Suspense boundaries normally

- Add `compositeStream()` to stitch shell + dynamic stream

## Phase 5: Runtime Serving with PPR

Update [`bun-react/src/framework/server/index.ts`](bun-react/src/framework/server/index.ts):

- Modify `tryServeWithISR()` to handle PPR routes:

  1. Load pre-rendered shell from `dist/shells/`
  2. If route has Suspense boundaries, stream dynamic parts
  3. Add `X-Cache: PPR` header for debugging

## Phase 6: Cache Invalidation API

Extend [`bun-react/src/api/revalidate.ts`](bun-react/src/api/revalidate.ts):

- Add `revalidateTag` endpoint for tag-based invalidation
- Invalidate all components with matching tag
- Trigger re-render of affected shells

## Phase 7: Hydration Updates

Update [`bun-react/src/framework/client/hydrate.tsx`](bun-react/src/framework/client/hydrate.tsx):

- Handle PPR pages where shell is pre-rendered
- Hydrate only client components and streamed dynamic parts
- Cached server components don't need hydration

## Key Files to Create/Modify

| File | Action |

|------|--------|

| `framework/shared/cache.ts` | Create - cache primitives |

| `framework/server/cache.ts` | Extend - component cache storage |

| `framework/server/render.tsx` | Modify - cache-aware rendering |

| `framework/server/index.ts` | Modify - PPR serving logic |

| `build.ts` | Modify - shell extraction |

| `api/revalidate.ts` | Extend - tag invalidation |

| `framework/client/hydrate.tsx` | Modify - PPR hydration |

### To-dos

- [ ] Create cacheComponent() wrapper and cache utilities in shared/cache.ts
- [ ] Extend server/cache.ts with component-level cache storage
- [ ] Add shell extraction logic to build.ts for build-time pre-rendering
- [ ] Modify render.tsx with cache-aware rendering and compositeStream
- [ ] Update server/index.ts with PPR-aware serving logic
- [ ] Add revalidateTag endpoint to api/revalidate.ts
- [ ] Update hydrate.tsx for PPR page hydration
- [ ] Create demo page showcasing static + cached + dynamic content