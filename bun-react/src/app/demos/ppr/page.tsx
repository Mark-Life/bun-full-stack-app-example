/**
 * PPR (Partial Prerendering) Demo Page
 * Demonstrates static shell + cached components + dynamic streaming
 */

import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cacheComponent, dynamicComponent } from "~/framework/shared/cache";

/**
 * Static shell - pure component, no data fetching
 * Currently SSR'd on each request (true static shells not implemented yet)
 */
const StaticShell = () => (
  <Card className="border-2 border-green-500/50 border-dashed bg-green-500/5">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-full bg-green-500" />
        Static Shell (Pure Component)
      </CardTitle>
      <CardDescription>
        Pure component with no data fetching. In full PPR, this would be
        pre-rendered at build time and served from disk.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground text-sm">
        Currently SSR'd - true build-time shell extraction not yet implemented.
      </p>
    </CardContent>
  </Card>
);

/**
 * Static header - automatically included in shell
 */
const Header = () => (
  <header className="border-b bg-card p-6">
    <h1 className="font-bold text-3xl">PPR Demo</h1>
    <p className="mt-2 text-muted-foreground">
      This page demonstrates Partial Prerendering with static shell, cached
      components, and dynamic streaming.
    </p>
  </header>
);

/**
 * Server-side render counter for ProductCatalog
 * This proves the component only executes once
 */
let catalogRenderCount = 0;

/**
 * Cached component - executes once, then cached
 * Watch the server logs to see this only logs on FIRST request
 */
const ProductCatalog = cacheComponent(async () => {
  // Increment counter and capture timestamp
  catalogRenderCount += 1;
  const renderTime = new Date().toISOString();

  // Log to server console - you'll see this only on first request!
  console.log("\n🔵 [ProductCatalog] EXECUTING component!");
  console.log(`   Render #${catalogRenderCount} at ${renderTime}`);
  console.log("   This should only happen ONCE per server restart\n");

  // Simulate API call - in real app this would fetch from database
  await new Promise((resolve) => setTimeout(resolve, 100));

  const products = [
    { id: 1, name: "Product A", price: 29.99 },
    { id: 2, name: "Product B", price: 39.99 },
    { id: 3, name: "Product C", price: 49.99 },
  ];

  return (
    <Card className="bg-primary/10">
      <CardHeader>
        <CardTitle>Product Catalog (Cached)</CardTitle>
        <CardDescription>
          Render #{catalogRenderCount} at {renderTime}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {products.map((product) => (
            <li className="flex justify-between" key={product.id}>
              <span>{product.name}</span>
              <span className="font-semibold">${product.price}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t pt-2 text-muted-foreground text-xs">
          ☝️ If cached correctly, render # and time stay the same on refresh
        </p>
      </CardContent>
    </Card>
  );
});

/**
 * Server-side render counter for UserDashboard
 * This proves the component executes on EVERY request
 */
let dashboardRenderCount = 0;

/**
 * Dynamic component - streams at request time
 * Wrapped with dynamicComponent() to serialize output for hydration
 */
const UserDashboard = dynamicComponent(async () => {
  // Increment counter and capture timestamp
  dashboardRenderCount += 1;
  const renderTime = new Date().toISOString();

  // Log to server console - you'll see this on EVERY request!
  console.log("\n⚫ [UserDashboard] EXECUTING component!");
  console.log(`   Render #${dashboardRenderCount} at ${renderTime}`);
  console.log("   This happens on EVERY request (dynamic)\n");

  // Simulate API call that requires request context (cookies, headers, etc.)
  await new Promise((resolve) => setTimeout(resolve, 500));

  // In real app, this would read cookies/headers to personalize content
  const userName = "Guest User";
  const recommendations = [
    "Recommended Product X",
    "Recommended Product Y",
    "Recommended Product Z",
  ];

  return (
    <Card className="bg-secondary/10">
      <CardHeader>
        <CardTitle>Personalized Dashboard (Dynamic)</CardTitle>
        <CardDescription>
          Render #{dashboardRenderCount} at {renderTime}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="font-semibold">Welcome, {userName}!</p>
          </div>
          <div>
            <p className="mb-2 font-semibold">Recommendations:</p>
            <ul className="list-inside list-disc space-y-1">
              {recommendations.map((rec) => (
                <li key={rec}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 border-t pt-2 text-muted-foreground text-xs">
          ☝️ Render # and time change on every refresh (dynamic)
        </p>
      </CardContent>
    </Card>
  );
});

/**
 * Loading fallback for dynamic content
 */
const DashboardFallback = () => (
  <Card className="bg-secondary/10">
    <CardHeader>
      <CardTitle>Personalized Dashboard (Loading...)</CardTitle>
      <CardDescription>Loading your personalized content...</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-4 w-48 rounded bg-muted" />
        <div className="h-4 w-40 rounded bg-muted" />
      </div>
    </CardContent>
  </Card>
);

/**
 * Main page component
 * Combines static shell + cached components + dynamic streaming
 */
export default function PPRDemoPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Static content - automatically in shell */}
      <Header />

      {/* Static shell - pre-rendered at build time, no SSR */}
      <StaticShell />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cached component - no Suspense needed, uses RSC serialization */}
        {/* Output is serialized at render time and restored on client */}
        <ProductCatalog />

        {/* Dynamic component - streams at request time */}
        <Suspense fallback={<DashboardFallback />}>
          <UserDashboard />
        </Suspense>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 inline-block size-3 shrink-0 rounded-full bg-green-500" />
            <p>
              <strong>Static Shell:</strong> Pure components with no data
              fetching. (Build-time extraction not yet implemented - currently
              SSR'd)
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-1.5 inline-block size-3 shrink-0 rounded-full bg-primary" />
            <p>
              <strong>Cached Components:</strong> Components wrapped with{" "}
              <code className="rounded bg-muted px-1">cacheComponent()</code>{" "}
              execute once on first request, then HTML is cached. Subsequent
              requests skip re-execution entirely.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-1.5 inline-block size-3 shrink-0 rounded-full bg-secondary" />
            <p>
              <strong>Dynamic Streaming:</strong> Components inside{" "}
              <code className="rounded bg-muted px-1">&lt;Suspense&gt;</code>{" "}
              execute on every request and stream in as they complete.
            </p>
          </div>
          <p className="pt-2 text-muted-foreground text-sm">
            Watch the server logs and refresh the page. ProductCatalog logs only
            once, UserDashboard logs every time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
