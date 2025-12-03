import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { definePage } from "~/framework/shared/page";

/**
 * Static generation demo page
 * This page is pre-rendered at build time
 */
const StaticDemoPage = ({
  data,
}: {
  data?: { buildTime: string; message: string } | null;
}) => {
  const { buildTime, message } = data || {
    buildTime: "Unknown",
    message: "No data loaded",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 font-bold text-4xl">Static Site Generation</h1>
        <p className="text-lg text-muted-foreground">
          This page was pre-rendered at build time. It loads instantly and works
          perfectly without JavaScript.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Build-Time Data</CardTitle>
          <CardDescription>
            This data was fetched during the build process
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="mb-2 font-semibold text-sm">Build Timestamp:</p>
            <code className="text-lg">{buildTime}</code>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="mb-2 font-semibold text-sm">Message:</p>
            <p className="text-lg">{message}</p>
          </div>
          <p className="text-muted-foreground text-sm">
            This timestamp was generated when the site was built, not when you
            requested the page. The HTML file exists on disk and is served
            instantly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Static Generation Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
            <li>
              During build, the framework identifies pages marked as{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                type: 'static'
              </code>
            </li>
            <li>
              For each static page, the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                loader
              </code>{" "}
              function runs to fetch data
            </li>
            <li>React renders the component tree with the loaded data</li>
            <li>
              HTML is written to disk in the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                dist/pages
              </code>{" "}
              directory
            </li>
            <li>
              In production, these HTML files are served directly (no server
              rendering needed)
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>
              Fastest possible load time - pre-rendered HTML served from CDN
            </li>
            <li>
              Zero server cost - can be hosted on static hosting (Vercel,
              Netlify, etc.)
            </li>
            <li>Perfect SEO - full HTML content available immediately</li>
            <li>Works offline - HTML files can be cached indefinitely</li>
            <li>Scales infinitely - no server load, just file serving</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When to Use Static Generation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-muted-foreground">
            Static generation is perfect for:
          </p>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>Marketing pages and landing pages</li>
            <li>Blog posts and documentation</li>
            <li>Product catalogs (with ISR for updates)</li>
            <li>Any content that doesn&apos;t change on every request</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default definePage({
  type: "static",
  loader: async () => {
    // Simulate fetching data at build time
    const buildTime = await new Date().toISOString();
    const message =
      "This message was generated during the build process. The page is now a static HTML file.";
    return { buildTime, message };
  },
  component: StaticDemoPage,
});
