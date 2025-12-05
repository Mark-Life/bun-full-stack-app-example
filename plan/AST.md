# AST Parsing and Code Analysis Improvements

## Overview

This document analyzes the codebase's use of regex vs AST parsing for code analysis, documents what has been refactored, and outlines future improvement opportunities.

## What Was Refactored

### 1. Import Extraction (`src/framework/shared/rsc.ts`)

**Before:** Regex-based import extraction using `IMPORT_FROM_REGEX`
```typescript
const IMPORT_FROM_REGEX = /import\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g;
```

**After:** Using `Bun.Transpiler.scanImports()`
```typescript
const extractImportPaths = (content: string): string[] => {
  try {
    const imports = transpiler.scanImports(content);
    return imports.map((imp) => imp.path);
  } catch {
    return [];
  }
};
```

**Benefits:**
- Handles multiline imports correctly
- Supports destructured imports
- Handles `require()`, dynamic `import()`, and CSS imports
- Automatically ignores type-only imports
- Native performance (faster than regex for large files)
- No edge cases to maintain

### 2. Client Component Detection (`src/framework/shared/rsc.ts`)

**Before:** Multiple fragile regex patterns
- `CLIENT_COMPONENT_REGEX` - function call detection
- `IMPORT_CLIENT_COMPONENT_REGEX` - import detection
- `EXPORT_CLIENT_COMPONENT_REGEX` - export detection

**After:** Hybrid approach
- Kept `USE_CLIENT_DIRECTIVE_REGEX` (fast, correct for directives)
- Kept `CLIENT_COMPONENT_REGEX` (function call detection)
- Added `transpiler.scan()` to check imports more reliably
- Removed fragile export regex pattern

**Benefits:**
- More reliable import detection
- Handles complex import patterns
- Still fast for directive checks

### 3. Page Config Detection (`src/framework/shared/page.ts`)

**Before:** Simple regex `DEFINE_PAGE_REGEX` for presence check

**After:** Uses `transpiler.scan()` to check imports + regex fallback

**Benefits:**
- More accurate detection when `definePage` is imported
- Graceful fallback if parsing fails

### 4. Layout Config Detection (`src/framework/shared/layout.ts`)

**Before:** Simple regex `DEFINE_LAYOUT_REGEX` for presence check

**After:** Uses `transpiler.scan()` to check imports + regex fallback

**Benefits:**
- More accurate detection when `defineLayout` is imported
- Graceful fallback if parsing fails

## Remaining Regex Patterns

### Patterns That Should Stay as Regex

These patterns are appropriate for regex and don't benefit from AST parsing:

| Pattern | File | Reason |
|---------|------|--------|
| `USE_CLIENT_DIRECTIVE_REGEX` | `rsc.ts` | Simple directive check at file start, performant |
| `CLIENT_COMPONENT_REGEX` | `rsc.ts` | Function call detection, works well with regex |
| Path manipulation regex | `routes-plugin.ts`, `router.ts` | String operations, correct tool for the job |
| `TRAILING_SLASH_REGEX` | `router.tsx`, `hydrate.tsx` | Simple string replacement |
| `INTEGER_REGEX`, `FLOAT_REGEX` | `build.ts` | Value parsing, not code analysis |

### Patterns That Could Benefit from AST (Future Improvements)

These patterns extract values from object literals, which regex struggles with:

| Pattern | File | Current Limitation | Potential Solution |
|---------|------|-------------------|-------------------|
| `STATIC_TYPE_REGEX` | `page.ts` | Can match in comments/strings | Babel/ts-morph AST traversal |
| `REVALIDATE_REGEX` | `page.ts` | Can match in comments/strings | Babel/ts-morph AST traversal |
| `GENERATE_PARAMS_REGEX` | `page.ts` | Presence check only, not value extraction | Babel/ts-morph AST traversal |
| `LOADER_REGEX` | `page.ts` | Presence check only, not value extraction | Babel/ts-morph AST traversal |
| `CLIENT_NAVIGATION_REGEX` | `layout.ts` | Can match in comments/strings | Babel/ts-morph AST traversal |

## Future Improvement Options

### Option 1: Babel Parser + Traverse

**What it does:** Full AST parsing with visitor pattern

**Pros:**
- Industry standard, well-documented
- Handles all edge cases (comments, strings, etc.)
- Can extract exact values from object literals
- Rich plugin ecosystem

**Cons:**
- Slower than regex (5-20ms per file)
- Larger dependency (~2MB)
- More complex API

**Example:**
```typescript
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'

const extractPageConfig = (code: string) => {
  const ast = parse(code, { 
    sourceType: 'module', 
    plugins: ['typescript', 'jsx'] 
  })
  
  let config = {}
  traverse(ast, {
    CallExpression(path) {
      if (path.node.callee.name === 'definePage') {
        const arg = path.node.arguments[0]
        if (arg?.type === 'ObjectExpression') {
          // Extract type, revalidate, etc.
        }
      }
    }
  })
  return config
}
```

**When to use:** When you need to extract values from config objects reliably

### Option 2: ts-morph

**What it does:** Wrapper around TypeScript compiler API with easier API

**Pros:**
- Full TypeScript understanding
- Type-aware analysis
- Easier API than raw TS compiler
- Can resolve types and imports

**Cons:**
- Slower than Babel (10-50ms per file)
- Larger dependency
- More overhead for simple tasks

**Example:**
```typescript
import { Project } from 'ts-morph'

const project = new Project()
const sourceFile = project.addSourceFileAtPath(filePath)

const definePageCall = sourceFile
  .getDescendantsOfKind(SyntaxKind.CallExpression)
  .find(call => call.getExpression().getText() === 'definePage')

if (definePageCall) {
  const config = definePageCall.getArguments()[0]
  // Extract properties...
}
```

**When to use:** When you need TypeScript-specific analysis or type resolution

### Option 3: Runtime Import Analysis

**What it does:** Dynamically import modules and read attached config

**Pros:**
- 100% accurate (reads actual runtime values)
- No parsing overhead
- Uses existing `getPageConfig()` infrastructure

**Cons:**
- Requires executing code (side effects risk)
- Slower than static analysis
- Can't be used in all contexts (build-time only)

**Example:**
```typescript
const extractPageType = async (filePath: string): Promise<PageType> => {
  const mod = await import(filePath)
  if (hasPageConfig(mod.default)) {
    return getPageConfig(mod.default).type
  }
  return 'dynamic'
}
```

**When to use:** During build-time route discovery, when side effects are acceptable

### Option 4: Keep Regex (Current Approach)

**What it does:** Continue using regex with documented limitations

**Pros:**
- Fastest (0.01ms per file)
- No dependencies
- Simple to maintain
- Works well for controlled codebases

**Cons:**
- Can match false positives (comments, strings)
- Can't extract nested values reliably
- Requires careful pattern design

**When to use:** When patterns are simple and codebase is controlled (current state)

## Performance Comparison

| Method | Time per file | Use Case |
|--------|---------------|----------|
| Regex | ~0.01ms | Simple presence checks, string operations |
| Bun.Transpiler.scan() | ~1-2ms | Import/export analysis |
| Bun.Transpiler.scanImports() | ~0.5-1ms | Import-only analysis |
| Babel parse + traverse | ~5-20ms | Full AST analysis |
| ts-morph | ~10-50ms | TypeScript-aware analysis |
| Runtime import | ~10-100ms | Actual value extraction |

For 500 files:
- Regex: ~5ms total
- Bun.Transpiler: ~500ms-1s total
- Babel: ~2.5-10s total
- ts-morph: ~5-25s total

## Recommendations

### Current State (After Refactor)

✅ **Good as-is:**
- Import extraction (using `Bun.Transpiler.scanImports()`)
- Client component detection (hybrid approach)
- Page/layout presence detection (using `transpiler.scan()`)

⚠️ **Accept limitations:**
- Config value extraction (`type: 'static'`, `revalidate: 30`) - regex is fine for now
- These patterns are controlled (you define the conventions)
- Build tools fail loudly if something breaks

### Future Improvements (If Needed)

**If you encounter bugs from false positives:**

1. **First try:** Improve regex patterns to be more specific
   - Add negative lookaheads for comments
   - Check context (inside `definePage()` call)

2. **If that's not enough:** Use Babel for value extraction
   - Only for the specific patterns causing issues
   - Keep regex for simple checks

3. **If you need type resolution:** Use ts-morph
   - Only if you need to understand TypeScript types
   - Overkill for most cases

**When NOT to improve:**
- If current approach works reliably
- If performance is critical (build times)
- If patterns are simple and controlled

## Industry Practices

### What Major Frameworks Do

| Framework | Approach | Why |
|-----------|----------|-----|
| Next.js | SWC (Rust parser) | Speed + full control |
| Remix | esbuild + custom | Fast bundling |
| Astro | TypeScript compiler | Need TS understanding |
| Vite | esbuild + Rollup | Speed + flexibility |

**Pattern:** Most use **hybrid approaches** - fast checks first, AST when needed.

### Bun's Approach

Bun provides `Bun.Transpiler` which:
- Uses native Rust parser (fast)
- Exposes import/export scanning
- Doesn't expose full AST traversal
- Perfect for import analysis (what we're using)

**Limitation:** Can't extract values from object literals without full AST.

## Conclusion

The refactoring to use `Bun.Transpiler` for import/export analysis is the right approach. It provides:
- Better accuracy than regex
- Native performance
- Handles edge cases automatically

For value extraction from config objects, regex is acceptable for now given:
- Controlled codebase (you define conventions)
- Simple patterns
- Build-time validation catches issues

Consider AST parsing (Babel/ts-morph) only if:
- You encounter actual bugs from false positives
- You need to extract complex nested values
- You're building developer tools that need 100% accuracy

