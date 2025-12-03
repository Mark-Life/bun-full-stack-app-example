import { Link } from "@/components/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CodeBlock,
  CodeBlockCopyButton,
  SystemThemeWrapper,
} from "@/components/ui/code-block";
import { cn } from "@/lib/utils";
import { definePage } from "~/framework/shared/page";

// Code snippets for examples
const staticPageCode = `definePage({
  type: 'static',
  loader: async () => ({
    data: await fetchData()
  }),
  component: ({ data }) => (
    <div>{data.title}</div>
  )
})`;

const clientComponentCode = `// Using clientComponent() wrapper:
export const Counter = 
  clientComponent(() => {
    const [count, setCount] = 0
    return (
      <button onClick={() => 
        setCount(c => c + 1)}>
        {count}
      </button>
    )
  })

// Or using "use client" at top of file:
"use client";
export const Counter = () => { ... }`;

const clientNavCode = `defineLayout({
  clientNavigation: true,
  component: ({ children }) => (
    <nav>...</nav>
    {children}
  )
})`;

const isrCode = `definePage({
  type: 'static',
  revalidate: 3600, // Revalidate every hour
  loader: async () => ({
    products: await fetchProducts()
  }),
  component: ({ data }) => (
    <div>{data.products.map(...)}</div>
  )
})`;

const apiRouteCode = `// Define route
import { route } from "~/framework/shared/api";
import { z } from "zod";

export const byId = route({
  method: "GET",
  params: z.object({ id: z.string() }),
  response: z.object({ id: z.string(), name: z.string() }),
  handler: ({ params }) => getUser(params.id),
});

// Compose API
import { createAPI } from "~/framework/shared/api";
export const api = createAPI({
  users: { byId, create }
});`;

const middlewareCode = `import { defineMiddleware } from "~/framework/shared/middleware";

export default defineMiddleware({
  exclude: ["/favicon.ico", "/*.svg"],
  handler: async (request, next) => {
    console.log(\`\${request.method} \${request.url}\`);
    const response = await next();
    // Modify response headers, etc.
    return response;
  },
});`;

/**
 * Code examples section with syntax highlighting
 */
const CodeExamples = () => (
  <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Static Pages</CardTitle>
      </CardHeader>
      <CardContent>
        <SystemThemeWrapper>
          <CodeBlock code={staticPageCode} language="typescript">
            <CodeBlockCopyButton code={staticPageCode} />
          </CodeBlock>
        </SystemThemeWrapper>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">
          Client Components
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SystemThemeWrapper>
          <CodeBlock code={clientComponentCode} language="tsx">
            <CodeBlockCopyButton code={clientComponentCode} />
          </CodeBlock>
        </SystemThemeWrapper>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">
          Client Navigation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SystemThemeWrapper>
          <CodeBlock code={clientNavCode} language="tsx">
            <CodeBlockCopyButton code={clientNavCode} />
          </CodeBlock>
        </SystemThemeWrapper>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">
          Incremental Static Regeneration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SystemThemeWrapper>
          <CodeBlock code={isrCode} language="typescript">
            <CodeBlockCopyButton code={isrCode} />
          </CodeBlock>
        </SystemThemeWrapper>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">
          Typesafe API Routes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SystemThemeWrapper>
          <CodeBlock code={apiRouteCode} language="typescript">
            <CodeBlockCopyButton code={apiRouteCode} />
          </CodeBlock>
        </SystemThemeWrapper>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Middleware</CardTitle>
      </CardHeader>
      <CardContent>
        <SystemThemeWrapper>
          <CodeBlock code={middlewareCode} language="typescript">
            <CodeBlockCopyButton code={middlewareCode} />
          </CodeBlock>
        </SystemThemeWrapper>
      </CardContent>
    </Card>
  </div>
);

/**
 * Displays a feature item with status indicator (done/planned)
 */
const FeatureItem = ({
  children,
  status,
}: {
  children: React.ReactNode;
  status: "done" | "planned";
}) => (
  <div className="flex items-center justify-between gap-2">
    <span
      className={cn(
        "wrap-break-word flex-1",
        status === "planned" ? "text-muted-foreground" : ""
      )}
    >
      {children}
    </span>
    {status === "done" ? (
      <Badge
        className="shrink-0 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10"
        variant="secondary"
      >
        <span className="text-base leading-none">✓</span>
      </Badge>
    ) : (
      <Badge
        className="shrink-0 bg-destructive/10 text-destructive hover:bg-destructive/10"
        variant="secondary"
      >
        <span className="text-base leading-none">✗</span>
      </Badge>
    )}
  </div>
);

const demoFeatures = [
  {
    title: "Server-Side Rendering",
    description:
      "Full SSR with React Server Components. Render on server, hydrate only what's needed.",
    href: "/demos/ssr",
    icon: "⚡",
  },
  {
    title: "Suspense Streaming",
    description:
      "Progressive HTML streaming with Suspense boundaries. See content appear as it loads.",
    href: "/demos/suspense",
    icon: "🌊",
  },
  {
    title: "Static Generation",
    description:
      "Pre-render pages at build time for instant loads and perfect SEO.",
    href: "/demos/static",
    icon: "📦",
  },
  {
    title: "Incremental Static Regeneration",
    description:
      "Update static pages without rebuilding. Time-based and on-demand revalidation.",
    href: "/demos/isr",
    icon: "🔄",
  },
  {
    title: "Client-Side Navigation",
    description:
      "SPA-style navigation for route groups. Instant transitions without page reloads.",
    href: "/demos/client-nav",
    icon: "🚀",
  },
  {
    title: "Typesafe API Routes",
    description:
      "End-to-end type safety from server to client. tRPC-like inference with Zod validation.",
    href: "/demos/api",
    icon: "🔒",
  },
] as const;

const LandingPage = () => (
  <div className="min-h-screen bg-background">
    {/* Hero Section */}
    <section className="container relative z-10 mx-auto px-4 py-12 text-center sm:px-6 sm:py-16 md:py-24">
      <div className="mb-6 flex items-center justify-center gap-4 sm:mb-8 sm:gap-6 md:gap-8">
        <img
          alt="Bun Logo"
          className="h-20 scale-110 p-3 transition-all duration-300 hover:scale-125 hover:drop-shadow-[0_0_2em_#646cffaa] sm:h-28 sm:p-4 md:h-32 md:p-6 lg:h-40"
          height={160}
          src="/logo.svg"
          width={160}
        />
        <img
          alt="React Logo"
          className="h-20 animate-[spin_20s_linear_infinite] p-3 transition-all duration-300 hover:scale-110 hover:drop-shadow-[0_0_2em_#61dafbaa] sm:h-28 sm:p-4 md:h-32 md:p-6 lg:h-40"
          height={160}
          src="/react.svg"
          width={160}
        />
      </div>
      <h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
        Bun React Framework
      </h1>
      <p className="mx-auto mb-6 max-w-2xl text-lg text-muted-foreground sm:mb-8 sm:text-xl md:text-2xl">
        Next.js features. Bun speed.
      </p>
      <p className="mx-auto mb-8 max-w-3xl text-muted-foreground text-sm sm:mb-10 sm:text-base md:mb-12">
        A full-stack React framework built on Bun. Get SSR, static generation,
        ISR, client-side navigation, and typesafe APIs—all.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        <Button asChild size="lg">
          <Link href="/docs">Read Docs</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="#demos">View Demos</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a
            href="https://github.com/Mark-Life/bun-full-stack-app-example"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </Button>
      </div>
    </section>

    {/* Demo Cards Section */}
    <section
      className="container mx-auto px-4 py-12 sm:px-6 sm:py-16"
      id="demos"
    >
      <div className="mb-8 text-center sm:mb-12">
        <h2 className="mb-3 font-bold text-3xl sm:mb-4 sm:text-4xl">
          Feature Demos
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
          Explore each feature with interactive examples. Click any card to see
          it in action.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {demoFeatures.map((feature) => (
          <Link href={feature.href} key={feature.href}>
            <Card className="h-full cursor-pointer shadow-primary-hover transition-all duration-200">
              <CardHeader>
                <div className="mb-2 text-3xl sm:text-4xl">{feature.icon}</div>
                <CardTitle className="text-lg sm:text-xl">
                  {feature.title}
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>

    {/* Framework Features Section */}
    <section className="container mx-auto px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-8 text-center sm:mb-12">
        <h2 className="mb-3 font-bold text-3xl sm:mb-4 sm:text-4xl">
          Framework Features
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
          Next.js App Router patterns with Bun performance. See what's supported
          and what's coming.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 md:gap-8 xl:grid-cols-4">
        {/* File-Based Routing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="text-xl sm:text-2xl">📁</span>
              File-Based Routing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs sm:text-sm">
            <FeatureItem status="done">page.tsx / index.tsx</FeatureItem>
            <FeatureItem status="done">layout.tsx (nested)</FeatureItem>
            <FeatureItem status="done">not-found.tsx</FeatureItem>
            <FeatureItem status="done">[param] dynamic routes</FeatureItem>
            <FeatureItem status="done">[...path] catch-all</FeatureItem>
            <FeatureItem status="planned">loading.tsx</FeatureItem>
          </CardContent>
        </Card>

        {/* Rendering Strategies */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="text-xl sm:text-2xl">🎨</span>
              Rendering Strategies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs sm:text-sm">
            <FeatureItem status="done">Server-Side Rendering</FeatureItem>
            <FeatureItem status="done">Static Generation (SSG)</FeatureItem>
            <FeatureItem status="done">
              Incremental Static Regen (ISR)
            </FeatureItem>
            <FeatureItem status="done">Suspense Streaming</FeatureItem>
            <FeatureItem status="done">Client-Side Navigation</FeatureItem>
            <FeatureItem status="planned">
              Partial Prerendering (PPR)
            </FeatureItem>
          </CardContent>
        </Card>

        {/* Components & Data */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="text-xl sm:text-2xl">⚛️</span>
              Components & Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs sm:text-sm">
            <FeatureItem status="done">Server Components (default)</FeatureItem>
            <FeatureItem status="done">Client Components</FeatureItem>
            <FeatureItem status="done">loader() data fetching</FeatureItem>
            <FeatureItem status="done">generateParams()</FeatureItem>
            <FeatureItem status="done">Async Components</FeatureItem>
            <FeatureItem status="planned">Cache Components</FeatureItem>
          </CardContent>
        </Card>

        {/* API & Infrastructure */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="text-xl sm:text-2xl">🔧</span>
              API & Infrastructure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs sm:text-sm">
            <FeatureItem status="done">Typesafe API Routes</FeatureItem>
            <FeatureItem status="done">Zod Validation</FeatureItem>
            <FeatureItem status="done">Middleware</FeatureItem>
            <FeatureItem status="done">On-Demand Revalidation</FeatureItem>
            <FeatureItem status="done">HMR Development</FeatureItem>
            <FeatureItem status="done">Tailwind CSS</FeatureItem>
          </CardContent>
        </Card>
      </div>
    </section>

    {/* Code Examples Section */}
    <section className="container mx-auto px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-8 text-center sm:mb-12">
        <h2 className="mb-3 font-bold text-3xl sm:mb-4 sm:text-4xl">
          Simple API
        </h2>
        <p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
          Clean, intuitive APIs that feel familiar. Built for developer
          experience.
        </p>
      </div>
      <CodeExamples />
    </section>

    {/* Footer */}
    <footer className="container mx-auto border-t px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="text-muted-foreground text-xs sm:text-sm">
          Built with Bun and React. Open source.
        </p>
        <div className="flex gap-4">
          <Link
            className="text-muted-foreground text-xs hover:text-foreground hover:underline sm:text-sm"
            href="/docs"
          >
            Documentation
          </Link>
          <a
            className="text-muted-foreground text-xs hover:text-foreground hover:underline sm:text-sm"
            href="https://github.com/Mark-Life/bun-full-stack-app-example"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  </div>
);

export default definePage({
  type: "static",
  component: LandingPage,
});
