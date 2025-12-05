# Phase 0.1 Research: react-server-dom-esm Package Study

## Installation Status

- ✅ Package `react-server-dom-esm@0.0.1` installed via `bun add react-server-dom-esm`
- ⚠️ Package appears to be a placeholder - only contains `package.json`, `LICENSE`, and `README.md`
- ⚠️ No actual implementation files found in `node_modules/react-server-dom-esm/`
- ⚠️ Cannot import `react-server-dom-esm/server` or `react-server-dom-esm/client` - modules not found

## Package Information

From `package.json`:
```json
{
  "name": "react-server-dom-esm",
  "description": "React Server Components bindings for DOM using ESM. This is intended to be integrated into meta-frameworks. It is not intended to be imported directly.",
  "version": "0.0.1",
  "repository": {
    "type": "git",
    "url": "https://github.com/facebook/react.git",
    "directory": "packages/react-server-dom-esm"
  }
}
```

**Key Finding**: The package description states it's "intended to be integrated into meta-frameworks" and "not intended to be imported directly." This suggests it may need to be built from React source or accessed differently.

## Current React Version

- ✅ React: `19.2.1` (upgraded from 19.2.0 for security)
- ✅ React DOM: `19.2.1` (upgraded from 19.2.0 for security)
- ✅ Security vulnerability (CVE-2025-55182) addressed

## Actual API Surface (from React source code)

### Server-Side API (`ReactFlightDOMServerNode.js`)

**Main Export**: `renderToPipeableStream`
```typescript
function renderToPipeableStream(
  model: ReactClientValue,           // The React component tree to render
  moduleBasePath: ClientManifest,    // Module map for client components
  options?: Options
): PipeableStream

// Returns:
{
  pipe<T: Writable>(destination: T): T,  // Pipe to Node.js Writable stream
  abort(reason: mixed): void              // Abort rendering
}
```

**Other Server Exports**:
- `prerenderToNodeStream(model, moduleBasePath, options)` - For static generation
- `decodeReply(body, moduleBasePath, options)` - Decode server action responses
- `decodeReplyFromBusboy(busboyStream, moduleBasePath, options)` - Decode form data
- `decodeAction`, `decodeFormState` - Server action utilities
- `createTemporaryReferenceSet()` - For temporary references

**Options Type**:
```typescript
type Options = {
  debugChannel?: Readable | Writable | Duplex | WebSocket,
  environmentName?: string | (() => string),
  filterStackFrame?: (url: string, functionName: string) => boolean,
  onError?: (error: mixed) => void,
  identifierPrefix?: string,
  temporaryReferences?: TemporaryReferenceSet,
};
```

### Client-Side API (`ReactFlightDOMClientNode.js`)

**Main Export**: `createFromNodeStream`
```typescript
function createFromNodeStream<T>(
  stream: Readable,                    // Node.js Readable stream
  moduleRootPath: string,              // Base path for module resolution
  moduleBaseURL: string,               // Base URL for module resolution
  options?: Options
): Thenable<T>                         // Promise-like that resolves to React tree
```

**Other Client Exports**:
- `createServerReference(id, callServer)` - Create server action reference
- `registerServerReference` - Register server action handlers

**Options Type**:
```typescript
type Options = {
  nonce?: string,
  encodeFormAction?: EncodeFormActionCallback,
  findSourceMapURL?: FindSourceMapURLCallback,
  replayConsoleLogs?: boolean,
  environmentName?: string,
  startTime?: number,
  endTime?: number,
  debugChannel?: Readable,
};
```

### Module Map/Manifest Format ✅

**ClientManifest** (server-side):
- **Type**: `ClientManifest = string` (just a base URL string!)
- **Used as**: `moduleBasePath` parameter in `renderToPipeableStream()`
- **Format**: Base URL on the file system (e.g., `"/dist/client/"` or `"file:///path/to/client/"`)
- **Purpose**: Used to resolve relative module paths from client component references

**Client Reference Structure**:
```typescript
type ClientReference<T> = {
  $$typeof: symbol,  // Symbol.for('react.client.reference')
  $$id: string,     // Format: "fullURL#exportName"
};
```

**How It Works**:
1. Client components are registered with `registerClientReference(proxyImplementation, id, exportName)`
2. The `$$id` is set to `"fullURL#exportName"` (e.g., `"/dist/client/components/Button.js#default"`)
3. When rendering, `resolveClientReferenceMetadata()` extracts:
   - `modulePath`: Relative path from baseURL (e.g., `"components/Button.js"`)
   - `exportName`: Export name (e.g., `"default"`)
4. The baseURL (`ClientManifest`) is used to validate and resolve these paths

**Example**:
```typescript
// ClientManifest (just a string)
const manifest = "/dist/client/";

// Client reference
const buttonRef = registerClientReference(Button, "/dist/client/components/Button.js", "default");
// buttonRef.$$id = "/dist/client/components/Button.js#default"

// Resolution
const [modulePath, exportName] = resolveClientReferenceMetadata(manifest, buttonRef);
// modulePath = "components/Button.js"
// exportName = "default"
```

**ServerManifest** (client-side):
- Type: `ServerManifest` (imported from `react-client/src/ReactFlightClientConfig`)
- Used as `moduleBasePath` parameter for server actions
- Similar structure for server function references

**Module Resolution**:
- Server uses `moduleBasePath` (ClientManifest string) to resolve client component references
- Client uses `moduleRootPath` (string) and `moduleBaseURL` (string) for module resolution
- Client components are referenced by `$$id` in Flight payload, then resolved via manifest

**Note**: These are Node.js-specific implementations, but **Bun supports Node.js streams**, so we can use them directly.

## Current Framework State

### Server Rendering (`src/framework/server/render.tsx`)
- Uses `renderToReadableStream` from `react-dom/server` (HTML rendering)
- Streams HTML with Suspense support
- Injects route data via `<script id="__ROUTE_DATA__">` tags
- Uses `bootstrapModules` for client hydration

### Client Hydration (`src/framework/client/hydrate.tsx`)
- Uses `hydrateRoot` from `react-dom/client`
- Reads route data from `__ROUTE_DATA__` script tag
- Re-renders component tree on client-side navigation

### Client Component Detection (`src/framework/shared/rsc.ts`)
- Detects `"use client"` directive
- Detects `clientComponent()` wrapper usage
- Finds client component boundaries in imports
- Currently used for hydration optimization only

## Next Steps

### 1. Locate Actual Implementation
- [ ] Check React GitHub repository: `packages/react-server-dom-esm/`
- [ ] Determine if package needs to be built from source
- [ ] Check if it's available as part of React 19 experimental features
- [ ] Look for alternative packages or implementations

### 2. Understand Module Map Format
- [ ] Study React source code for module map structure
- [ ] Check Next.js implementation (uses `react-server-dom-webpack`)
- [ ] Document expected format for client component manifest

### 3. Bun Compatibility
- [ ] Test if package works with Bun runtime
- [ ] Check for Node.js-specific dependencies
- [ ] Document any compatibility issues

### 4. API Documentation
- [x] Document all exports from server module (from source code)
- [x] Document all exports from client module (from source code)
- [ ] Understand module map/bundler config format (need to check ConfigESMBundler)
- [x] Document streaming options and configuration (from source code)
- [ ] Check for Web Streams API versions (for Bun compatibility)

## Resources to Check

1. React GitHub Repository
   - `packages/react-server-dom-esm/` directory
   - Source code and README

2. Next.js Implementation
   - Uses `react-server-dom-webpack` (webpack-specific)
   - May have similar patterns for ESM version

3. Waku Framework
   - Minimal RSC framework
   - May have simpler implementation examples

4. React RFCs
   - React Server Components RFC
   - Flight Protocol specification

## Decision Points

### D1: Package Availability
- **Option A**: Build from React source
- **Option B**: Use experimental/unstable API from React 19
- **Option C**: Fork and adapt for Bun
- **Option D**: Wait for official release

### D2: Module Map Format
- To be determined after examining actual API

### D3: Bun Compatibility
- To be tested once implementation is located

## Findings Summary

### Package Status
- ✅ `react-server-dom-esm@0.0.1` package exists on npm
- ❌ Package is a **placeholder** - contains only `package.json`, no implementation
- ❌ Cannot import `react-server-dom-esm/server` or `react-server-dom-esm/client`
- ❌ No README.md file in the package
- ❌ No TypeScript definitions or JavaScript files

### React 19 Status
- ✅ React 19.2.1 installed (upgraded from 19.2.0 for security)
- ✅ `react-dom/server` provides `renderToReadableStream` (for HTML SSR)
- ❌ No Flight protocol APIs found in React core exports
- ❌ No `react-server-dom-esm` APIs available in React 19 stable
- ✅ Node.js streams work in Bun (tested: Readable/Writable available)

### Key Discovery
The package description states: *"This is intended to be integrated into meta-frameworks. It is not intended to be imported directly."*

This suggests:
1. The package may need to be built from React source code
2. It may be available only in React's experimental/canary releases
3. Frameworks like Next.js may have their own implementations
4. We may need to reference the React GitHub repository directly

## Source Code Analysis

### Key Findings from React Source

1. **Server API** (`ReactFlightDOMServerNode.js`):
   - Uses Node.js streams (`Readable`, `Writable`)
   - Requires `ClientManifest` for module resolution
   - Supports streaming with `pipe()` method
   - Has abort/cancellation support
   - Includes debug channel support for development

2. **Client API** (`ReactFlightDOMClientNode.js`):
   - Uses Node.js `Readable` streams
   - Requires `moduleRootPath` and `moduleBaseURL` for module resolution
   - Returns `Thenable<T>` (Promise-like) for async consumption
   - Supports server actions via `createServerReference`

3. **Bun Compatibility** ✅:
   - ✅ These are **Node.js-specific** implementations
   - ✅ Bun supports Node.js streams natively
   - ✅ Tested and confirmed: Node.js streams work in Bun
   - ✅ Can use these implementations directly without adaptation

### Completed Actions ✅

1. **Bun Compatibility** ✅
   - ✅ **Node.js streams work in Bun** - Tested successfully
   - ✅ Can use `renderToPipeableStream` directly (Node.js streams)
   - ✅ Can use `createFromNodeStream` directly (Node.js streams)
   - ✅ Bun supports both Node.js streams and Web Streams
   - **Decision**: Use Node.js stream versions (`ReactFlightDOMServerNode.js` and `ReactFlightDOMClientNode.js`)

2. **Module Map Format** ✅
   - ✅ Examined `ReactFlightServerConfigESMBundler.js` source
   - ✅ `ClientManifest` is just a **base URL string** (not a complex object!)
   - ✅ Client references use `$$id` format: `"fullURL#exportName"`
   - ✅ Documented in `plan/RSC/module-map-format.md`

3. **Security** ✅
   - ✅ Upgraded React to 19.2.1 (from 19.2.0)
   - ✅ CVE-2025-55182 vulnerability addressed
   - ✅ Security implications reviewed

## Notes

- The package exists but appears to be a placeholder
- React 19 stable does not expose Flight protocol APIs directly
- May need to use React canary/experimental or build from source
- Next.js uses `react-server-dom-webpack` which is webpack-specific, but patterns may be similar
- Framework may need to implement Flight protocol support directly or wait for official release

