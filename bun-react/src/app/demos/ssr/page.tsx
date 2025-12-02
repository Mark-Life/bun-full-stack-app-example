import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * SSR Demo Page
 * This page demonstrates server-side rendering - the timestamp is rendered on the server
 */
export default function SSRDemoPage() {
  const serverTimestamp = new Date().toISOString();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 font-bold text-4xl">Server-Side Rendering</h1>
        <p className="text-lg text-muted-foreground">
          This page is rendered entirely on the server. No client-side hydration
          needed for the content below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Rendered Content</CardTitle>
          <CardDescription>
            This timestamp was generated on the server at render time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="mb-2 font-semibold text-sm">Server Timestamp:</p>
            <code className="text-lg">{serverTimestamp}</code>
          </div>
          <p className="text-muted-foreground text-sm">
            This timestamp is embedded in the HTML sent from the server. If you
            view the page source, you&apos;ll see this exact timestamp in the
            HTML. No JavaScript is required to display it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How SSR Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
            <li>Request arrives at the server with a route path</li>
            <li>
              Server matches the route and renders the React component tree
            </li>
            <li>React generates HTML string with all data embedded</li>
            <li>HTML is sent to the client immediately</li>
            <li>Browser displays content before JavaScript loads</li>
            <li>Only client components (if any) hydrate for interactivity</li>
          </ol>
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-muted-foreground text-sm">
              <strong className="text-foreground">Note:</strong> This page has
              no client components, so there&apos;s no hydration at all. Pure
              server-rendered HTML.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>Fast initial page load - content appears immediately</li>
            <li>SEO-friendly - search engines see full content</li>
            <li>Works without JavaScript - graceful degradation</li>
            <li>Smaller bundle size - no hydration code needed</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
