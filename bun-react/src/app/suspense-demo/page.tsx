import { Suspense } from "react";
import { Link } from "@/components/link";

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
    <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
      <p className="font-semibold text-primary">✅ {data}</p>
      <p className="text-sm text-muted-foreground mt-2">
        This content streamed in after the initial HTML shell
      </p>
    </div>
  );
};

/**
 * Loading fallback component
 */
const LoadingFallback = () => (
  <div className="p-4 bg-muted rounded-lg animate-pulse">
    <p className="font-semibold text-foreground">⏳ Loading...</p>
    <p className="text-sm text-muted-foreground mt-2">
      This fallback shows while data is being fetched
    </p>
  </div>
);

/**
 * Suspense demo page showcasing progressive streaming
 */
export default function SuspenseDemoPage() {
  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-6">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-sm font-medium inline-flex items-center gap-1"
        >
          ← Back to Home
        </Link>
      </div>
      <h1 className="text-4xl font-bold mb-6">Suspense Streaming Demo</h1>

      <div className="mb-8 p-4 bg-muted rounded-lg">
        <p className="font-semibold mb-2 text-foreground">How it works:</p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
          <li>Initial HTML shell streams immediately</li>
          <li>Suspense fallback shows while async data loads</li>
          <li>Content streams in progressively as promises resolve</li>
          <li>Hydration script loads at the end</li>
        </ol>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Fast Data (500ms)</h2>
          <Suspense fallback={<LoadingFallback />}>
            <AsyncData delay={500} />
          </Suspense>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Medium Data (1500ms)</h2>
          <Suspense fallback={<LoadingFallback />}>
            <AsyncData delay={1500} />
          </Suspense>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Slow Data (3000ms)</h2>
          <Suspense fallback={<LoadingFallback />}>
            <AsyncData delay={3000} />
          </Suspense>
        </section>
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> Open DevTools
          Network tab and watch the HTML stream arrive in chunks. The page shell
          appears first, then each Suspense boundary resolves and streams in its
          content.
        </p>
      </div>
    </div>
  );
}
