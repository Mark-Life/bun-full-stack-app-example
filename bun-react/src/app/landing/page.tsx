import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { definePage } from "~/framework/shared/page";

const LandingPage = () => (
  <div className="container relative z-10 mx-auto p-8">
    <div className="mb-6">
      <Link className="font-medium text-blue-600 hover:underline" href="/">
        ← Back to Home
      </Link>
    </div>
    <div className="mb-8 text-center">
      <h1 className="mb-4 font-bold text-4xl">Welcome to Our Landing Page</h1>
      <p className="text-lg text-muted-foreground">
        This is a static page pre-rendered at build time
      </p>
    </div>

    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Fast Performance</CardTitle>
          <CardDescription>
            Pre-rendered static pages load instantly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Static pages are generated at build time, ensuring optimal
            performance and SEO.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO Friendly</CardTitle>
          <CardDescription>
            Fully rendered HTML for search engines
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Search engines can easily crawl and index static pages without
            JavaScript execution.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost Effective</CardTitle>
          <CardDescription>
            Reduced server load and bandwidth usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Static pages can be served from CDN, reducing server costs and
            improving global performance.
          </p>
        </CardContent>
      </Card>
    </div>

    <div className="mt-8 text-center">
      <p className="text-muted-foreground text-sm">
        This page was generated at build time using{" "}
        <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">
          definePage()
        </code>{" "}
        with{" "}
        <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">
          type: 'static'
        </code>
      </p>
    </div>
  </div>
);

export default definePage({
  type: "static",
  component: LandingPage,
});
