import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Page component props with catch-all route params
 */
interface CatchAllPageProps {
  params?: {
    path: string;
  };
}

/**
 * Example page demonstrating catch-all route [...path]
 *
 * This page matches routes like:
 * - /catch-all/a
 * - /catch-all/a/b
 * - /catch-all/a/b/c/d/e/f
 * - Any number of segments after /catch-all/
 */
export default function CatchAllPage({ params }: CatchAllPageProps) {
  // Ensure params exists and has path, with fallback
  const { path = "" } = params || {};

  // Split the catch-all path into segments
  const segments = path.split("/").filter(Boolean);

  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-bold text-3xl">
            Catch-All Route: [...path]
          </CardTitle>
          <CardDescription>Catch-all dynamic segment example</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="font-semibold text-muted-foreground text-sm">
              Route Pattern:
            </p>
            <code className="text-sm">/catch-all/[...path]</code>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="font-semibold text-muted-foreground text-sm">
              Current URL:
            </p>
            <code className="text-sm">/catch-all/{path}</code>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="font-semibold text-muted-foreground text-sm">
              Captured Path:
            </p>
            <code className="text-sm">{path || "(empty)"}</code>
          </div>

          <div className="border-t pt-4">
            <h2 className="mb-2 font-semibold text-xl">Path Segments</h2>
            {segments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No segments captured (empty path)
              </p>
            ) : (
              <div className="space-y-2">
                {segments.map((segment, index) => {
                  // Create unique key from path prefix (position-based but stable)
                  const pathPrefix = segments.slice(0, index + 1).join("/");
                  return (
                    <div
                      className="flex items-center gap-2 rounded bg-muted p-2"
                      key={pathPrefix}
                    >
                      <span className="text-muted-foreground text-sm">
                        [{index}]:
                      </span>
                      <code className="text-sm">{segment}</code>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="mb-2 font-semibold text-sm">
              Try different path depths:
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                href="/catch-all/single"
              >
                Single Segment
              </Link>
              <Link
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                href="/catch-all/nested/deep"
              >
                Two Segments
              </Link>
              <Link
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                href="/catch-all/very/deeply/nested/path"
              >
                Four Segments
              </Link>
              <Link
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                href="/catch-all/a/b/c/d/e/f/g/h/i/j"
              >
                Many Segments
              </Link>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="mb-2 text-muted-foreground text-sm">
              <strong>Use case:</strong> Catch-all routes are useful for:
            </p>
            <ul className="ml-4 list-inside list-disc space-y-1 text-muted-foreground text-sm">
              <li>Documentation sites with nested paths</li>
              <li>File browsers or directory listings</li>
              <li>Fallback pages for unmatched routes</li>
              <li>Any route that needs to capture multiple segments</li>
            </ul>
          </div>

          <div className="border-t pt-4">
            <Link className="text-blue-600 hover:underline" href="/">
              ← Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
