import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Getting Started - Bun React Framework",
  description: "Getting started guide for the Bun React Framework",
};

export default function GettingStartedPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Getting Started</CardTitle>
          <CardDescription>
            Learn how to build with Bun React Framework
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="mb-4 font-semibold text-2xl">Installation</h2>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
              <code>{`bun install`}</code>
            </pre>
          </section>

          <section>
            <h2 className="mb-4 font-semibold text-2xl">Creating Routes</h2>
            <p className="mb-4 text-muted-foreground">
              To create a new route, simply create a folder in the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                src/app
              </code>{" "}
              directory and add either an{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                index.tsx
              </code>{" "}
              or{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                page.tsx
              </code>{" "}
              file.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
              <code>{`// src/app/about/page.tsx
export default function AboutPage() {
  return <div>About</div>;
}`}</code>
            </pre>
          </section>

          <section>
            <h2 className="mb-4 font-semibold text-2xl">Nested Layouts</h2>
            <p className="mb-4 text-muted-foreground">
              Create a{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                layout.tsx
              </code>{" "}
              file in any directory to wrap child routes with a layout
              component.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
              <code>{`// src/app/dashboard/layout.tsx
export default function DashboardLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <div>
      <nav>Dashboard Nav</nav>
      {children}
    </div>
  );
}`}</code>
            </pre>
          </section>

          <section>
            <h2 className="mb-4 font-semibold text-2xl">Static Pages</h2>
            <p className="mb-4 text-muted-foreground">
              Use{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                definePage()
              </code>{" "}
              to create static pages:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
              <code>{`import { definePage } from "~/framework/shared/page";

export default definePage({
  type: 'static',
  loader: async () => {
    const data = await fetchData();
    return { data };
  },
  component: ({ data }) => (
    <div>{data.title}</div>
  )
});`}</code>
            </pre>
          </section>

          <section>
            <h2 className="mb-4 font-semibold text-2xl">Next Steps</h2>
            <p className="mb-4 text-muted-foreground">
              Explore the interactive demos to see all features in action:
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
                href="/demos"
              >
                View All Demos
              </Link>
              <Link
                className="rounded border border-primary px-4 py-2 text-primary hover:bg-primary/10"
                href="/docs"
              >
                ← Back to Docs
              </Link>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
