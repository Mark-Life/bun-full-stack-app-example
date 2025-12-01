import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/Link";

export const metadata = {
  title: "Getting Started - Bun + React",
  description: "Getting started guide for the Bun + React app router",
};

export default function GettingStartedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl font-bold">Getting Started</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <h2 className="text-2xl font-semibold">Creating Routes</h2>
        <p>
          To create a new route, simply create a folder in the{" "}
          <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">
            src/app
          </code>{" "}
          directory and add either an <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">index.tsx</code> or{" "}
          <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">page.tsx</code> file.
        </p>
        <h2 className="text-2xl font-semibold">Nested Layouts</h2>
        <p>
          Create a <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">layout.tsx</code> file in any
          directory to wrap child routes with a layout component.
        </p>
        <div className="pt-4 space-x-4">
          <Link href="/docs" className="text-blue-600 hover:underline">
            ← Back to Docs
          </Link>
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

