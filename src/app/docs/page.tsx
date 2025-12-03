import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Documentation - Bun React Framework",
  description: "Documentation for the Bun React Framework",
};

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-bold text-3xl">Documentation</CardTitle>
          <CardDescription>
            Complete guide to building with Bun React Framework
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
            <h2 className="mb-2 font-semibold text-lg">
              MDX Support Coming Soon
            </h2>
            <p className="mb-4 text-muted-foreground">
              Full MDX documentation support is planned for a future release.
              For now, explore the framework features through the interactive
              demos.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
                href="/demos"
              >
                View Demos
              </Link>
              <Link
                className="rounded border border-primary px-4 py-2 text-primary hover:bg-primary/10"
                href="/docs/getting-started"
              >
                Getting Started
              </Link>
            </div>
          </div>

          <div>
            <h2 className="mb-4 font-semibold text-2xl">Quick Links</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <Link
                        className="text-primary hover:underline"
                        href="/demos/ssr"
                      >
                        Server-Side Rendering
                      </Link>
                    </li>
                    <li>
                      <Link
                        className="text-primary hover:underline"
                        href="/demos/suspense"
                      >
                        Suspense Streaming
                      </Link>
                    </li>
                    <li>
                      <Link
                        className="text-primary hover:underline"
                        href="/demos/static"
                      >
                        Static Generation
                      </Link>
                    </li>
                    <li>
                      <Link
                        className="text-primary hover:underline"
                        href="/demos/isr"
                      >
                        Incremental Static Regeneration
                      </Link>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>More Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <Link
                        className="text-primary hover:underline"
                        href="/demos/client-nav"
                      >
                        Client-Side Navigation
                      </Link>
                    </li>
                    <li>
                      <Link
                        className="text-primary hover:underline"
                        href="/demos/api"
                      >
                        Typesafe API Routes
                      </Link>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
