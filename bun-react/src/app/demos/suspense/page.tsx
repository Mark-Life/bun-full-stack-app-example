import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Simulate async data fetching with delay
 */
const fetchData = async (delay: number): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return `Data loaded after ${delay}ms`;
};

/**
 * Async component that fetches data
 * This will suspend during SSR until the promise resolves
 */
const AsyncData = async ({ delay }: { delay: number }) => {
  const data = await fetchData(delay);
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
      <p className="font-semibold text-primary">✅ {data}</p>
      <p className="mt-2 text-muted-foreground text-sm">
        This content streamed in after the initial HTML shell
      </p>
    </div>
  );
};

/**
 * Loading fallback component
 */
const LoadingFallback = () => (
  <div className="animate-pulse rounded-lg bg-muted p-4">
    <p className="font-semibold text-foreground">⏳ Loading...</p>
    <p className="mt-2 text-muted-foreground text-sm">
      This fallback shows while data is being fetched
    </p>
  </div>
);

/**
 * Suspense demo page showcasing progressive streaming
 */
export default function SuspenseDemoPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 font-bold text-4xl">Suspense Streaming</h1>
        <p className="text-lg text-muted-foreground">
          Progressive HTML streaming with Suspense boundaries. Content appears
          as it loads, not all at once.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
            <li>Initial HTML shell streams immediately</li>
            <li>Suspense fallback shows while async data loads</li>
            <li>Content streams in progressively as promises resolve</li>
            <li>Hydration script loads at the end</li>
          </ol>
          <div className="mt-4 rounded-lg bg-muted p-4">
            <p className="text-muted-foreground text-sm">
              <strong className="text-foreground">Tip:</strong> Open DevTools
              Network tab and watch the HTML stream arrive in chunks. The page
              shell appears first, then each Suspense boundary resolves and
              streams in its content.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <section>
          <h2 className="mb-4 font-semibold text-2xl">Fast Data (500ms)</h2>
          <Suspense fallback={<LoadingFallback />}>
            <AsyncData delay={500} />
          </Suspense>
        </section>

        <section>
          <h2 className="mb-4 font-semibold text-2xl">Medium Data (1500ms)</h2>
          <Suspense fallback={<LoadingFallback />}>
            <AsyncData delay={1500} />
          </Suspense>
        </section>

        <section>
          <h2 className="mb-4 font-semibold text-2xl">Slow Data (3000ms)</h2>
          <Suspense fallback={<LoadingFallback />}>
            <AsyncData delay={3000} />
          </Suspense>
        </section>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>
              Faster perceived performance - users see content as it loads
            </li>
            <li>Better UX - loading states show progress, not blank screens</li>
            <li>
              Efficient - only stream what&apos;s ready, don&apos;t wait for
              everything
            </li>
            <li>
              Works with React Server Components - async components suspend
              naturally
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
