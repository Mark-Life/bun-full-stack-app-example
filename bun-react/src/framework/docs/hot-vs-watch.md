## Why `--watch` Instead of `--hot`

### The Problem with `bun --hot`

Bun's `--hot` mode does **in-place module replacement** without restarting the process. This causes **React instance conflicts**:

```
Before HMR:
  page.tsx → imports React (instance A)
  code-block.tsx → imports React (instance A)
  ✅ Same React, hooks work

After HMR reload:
  page.tsx → imports React (instance B, fresh)
  code-block.tsx → imports React (instance A, stale cache)
  ❌ Different React instances → hook errors
```

**Error:** `resolveDispatcher().useState` returns `null` because React's internal dispatcher from instance A doesn't exist in instance B's context.

### Why This Happens

1. `bun --hot` selectively invalidates changed modules
2. But dependency modules (like components importing React) may keep stale references
3. React requires a **single instance** across all modules
4. After HMR, some modules have fresh React, others have stale React → conflict

### What We Tried

| Approach | Result |
|----------|--------|
| Static import registry (`route-modules.generated.ts`) | Reduced but didn't eliminate conflicts |
| `clientComponent()` skip SSR | Lost SSR content |
| Clear module caches manually | Still had race conditions |

### The Solution: `--watch`

```bash
# Instead of in-place reload
bun --hot server.ts

# Full process restart
bun --watch server.ts
```

**`--watch` restarts the entire process** (~50-100ms on Bun), guaranteeing:
- Single React instance
- No stale module references
- Clean state every time

### Our Custom HMR Layer

We kept a **WebSocket-based HMR** on top of `--watch` for browser updates:

```
File changes
  → bun --watch restarts server (~50ms)
  → WebSocket disconnects
  → Browser detects reconnection
  → Browser reloads automatically
  → CSS changes: hot-swap without reload
```

**What our HMR does:**
- Signals browser to reload when server restarts
- CSS hot-swap (no page reload needed)
- Reconnection detection for auto-refresh

**What Bun's `--hot` was supposed to do but couldn't reliably:**
- Keep React instances consistent
- Properly invalidate the entire module graph
- Handle dynamic imports with static dependencies

### TL;DR

| `bun --hot` | `bun --watch` + Custom HMR |
|-------------|---------------------------|
| In-place module swap | Full restart |
| ~0ms reload | ~50-100ms reload |
| React instance conflicts | ✅ Always clean |
| Complex cache management | Simple & reliable |
| Broken hooks after reload | ✅ Works every time |

We traded ~50ms of restart time for **guaranteed correctness**. The custom WebSocket HMR handles browser refresh and CSS hot-swap, giving us the same DX without the React conflicts.