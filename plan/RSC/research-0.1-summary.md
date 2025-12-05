# Phase 0.1 Research Summary

## ✅ Completed Tasks

### 1. Package Installation & Examination
- Installed `react-server-dom-esm@0.0.1`
- Found it's a placeholder package (no implementation files)
- Cannot import directly - needs to be built from React source

### 2. Server-Side API Study
**Source**: `ReactFlightDOMServerNode.js`

**Main Function**: `renderToPipeableStream(model, moduleBasePath, options)`
- Takes React component tree (`ReactClientValue`)
- Takes `ClientManifest` for module resolution
- Returns `PipeableStream` with `pipe()` and `abort()` methods
- Uses Node.js streams (`Readable`/`Writable`)

**Other Exports**:
- `prerenderToNodeStream()` - Static generation
- `decodeReply()` - Server actions
- `decodeReplyFromBusboy()` - Form data handling

### 3. Client-Side API Study
**Source**: `ReactFlightDOMClientNode.js`

**Main Function**: `createFromNodeStream(stream, moduleRootPath, moduleBaseURL, options)`
- Takes Node.js `Readable` stream
- Takes module paths for resolution
- Returns `Thenable<T>` (Promise-like) resolving to React tree

### 4. Bun Compatibility
- ✅ **Node.js streams work in Bun** (tested successfully)
- ✅ Can use `renderToPipeableStream` directly
- ✅ Can use `createFromNodeStream` directly
- **Decision**: Use Node.js stream versions (`*Node.js` files)

### 5. Security Update
- ✅ Upgraded React from 19.2.0 → 19.2.1
- ✅ Upgraded React DOM from 19.2.0 → 19.2.1
- ✅ CVE-2025-55182 vulnerability addressed

## 🔄 In Progress

### Module Map Format
- Need to examine `ReactFlightServerConfigESMBundler.js` for `ClientManifest` structure
- Likely format: Maps module IDs to chunk information
- Will document exact structure once source is examined

## 📋 Next Steps

1. **Examine Module Map Format**
   - Check `ReactFlightServerConfigESMBundler.js` source
   - Document `ClientManifest` type structure
   - Understand how client components are referenced

2. **Build Strategy**
   - Determine how to build `react-server-dom-esm` from React source
   - Or find alternative way to access these APIs
   - May need to fork/build React package

3. **Implementation Planning**
   - Plan how to integrate Flight rendering into current framework
   - Design module map generation system
   - Plan client-side Flight consumption

## Key Findings

1. **API Surface**: Clear understanding of server and client APIs
2. **Bun Compatibility**: Node.js streams work, can use existing implementations
3. **Security**: React upgraded to secure version
4. **Module Map**: Format needs further investigation

## References

- Server API: https://github.com/facebook/react/blob/main/packages/react-server-dom-esm/src/server/ReactFlightDOMServerNode.js
- Client API: https://github.com/facebook/react/blob/main/packages/react-server-dom-esm/src/client/ReactFlightDOMClientNode.js
- Config: https://github.com/facebook/react/blob/main/packages/react-server-dom-esm/src/server/ReactFlightServerConfigESMBundler.js

