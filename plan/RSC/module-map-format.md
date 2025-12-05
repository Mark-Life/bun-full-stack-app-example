# Module Map Format for React Server Components

## Overview

The module map format for `react-server-dom-esm` is **much simpler** than expected. It's not a complex object mapping - it's just a **base URL string**.

## ClientManifest Type

```typescript
export type ClientManifest = string; // base URL on the file system
```

**Example**: `"/dist/client/"` or `"file:///path/to/client/"`

## Client Reference Structure

Client components are represented as references with special properties:

```typescript
type ClientReference<T> = {
  $$typeof: symbol,  // Symbol.for('react.client.reference')
  $$id: string,      // Format: "fullURL#exportName"
};
```

## Registration

Client components are registered using:

```typescript
registerClientReference<T>(
  proxyImplementation: any,
  id: string,           // Full URL to module (e.g., "/dist/client/components/Button.js")
  exportName: string    // Export name (e.g., "default" or "Button")
): ClientReference<T>
```

This creates a reference object where:
- `$$typeof` = `Symbol.for('react.client.reference')`
- `$$id` = `"${id}#${exportName}"` (e.g., `"/dist/client/components/Button.js#default"`)

## Resolution

When rendering, the server resolves client references:

```typescript
resolveClientReferenceMetadata<T>(
  config: ClientManifest,        // Base URL string
  clientReference: ClientReference<T>
): ClientReferenceMetadata      // Returns [modulePath, exportName]
```

**Process**:
1. Extract `$$id` from reference (e.g., `"/dist/client/components/Button.js#default"`)
2. Split by `#` to get `fullURL` and `exportName`
3. Validate `fullURL` starts with `config` (baseURL)
4. Extract relative `modulePath` by removing baseURL prefix
5. Return `[modulePath, exportName]`

**Example**:
```typescript
const manifest = "/dist/client/";
const buttonRef = {
  $$typeof: Symbol.for('react.client.reference'),
  $$id: "/dist/client/components/Button.js#default"
};

const [modulePath, exportName] = resolveClientReferenceMetadata(manifest, buttonRef);
// modulePath = "components/Button.js"
// exportName = "default"
```

## Implementation Strategy

### For Our Framework

1. **Build Time**:
   - Scan for all `"use client"` files
   - Generate stable module IDs (file paths relative to client bundle root)
   - Build client bundle with these paths

2. **Server Runtime**:
   - Set `ClientManifest` to client bundle base URL (e.g., `"/dist/client/"`)
   - When importing client components, wrap them with `registerClientReference()`
   - Use file path + export name as the `id`

3. **Client Runtime**:
   - Use `moduleRootPath` and `moduleBaseURL` to resolve module paths
   - Load modules dynamically using the resolved paths

## Key Insights

1. **No Complex Mapping Needed**: The manifest is just a base URL string
2. **Component IDs are URLs**: Client components are identified by their file URL + export name
3. **Relative Path Resolution**: The baseURL is used to compute relative paths
4. **Export Name Matters**: Each export from a client component file needs its own reference

## References

- Source: `packages/react-server-dom-esm/src/server/ReactFlightServerConfigESMBundler.js`
- Client References: `packages/react-server-dom-esm/src/ReactFlightESMReferences.js`

