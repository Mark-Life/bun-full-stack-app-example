import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ClientNavDemoPage() {
  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="mb-4 font-bold text-4xl">Client-Side Navigation</h1>
        <p className="text-lg text-muted-foreground">
          This demo showcases SPA-style client-side navigation. Navigation
          between pages in this route group uses instant transitions without
          page reloads.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            This route group uses client-side navigation enabled via{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              defineLayout({"{ clientNavigation: true }"})
            </code>
            . All routes under{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              /demos/client-nav
            </code>{" "}
            will navigate without full page reloads.
          </p>
          <p className="text-muted-foreground">
            Try navigating to other pages and notice:
          </p>
          <ul className="list-disc space-y-1 pl-6 text-muted-foreground">
            <li>No page reload (instant navigation)</li>
            <li>Layout persists (navigation bar stays)</li>
            <li>Browser back/forward buttons work</li>
            <li>URL updates correctly</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>Overview of your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Users</span>
                <span className="font-semibold">1,234</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Sessions</span>
                <span className="font-semibold">567</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-semibold">$12,345</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• User registration increased by 15%</li>
              <li>• New feature deployed successfully</li>
              <li>• System maintenance completed</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Navigation Demo</CardTitle>
            <CardDescription>Try client-side navigation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground text-sm">
              Click the links in the navigation bar above. Notice how the page
              doesn&apos;t reload - this is client-side navigation!
            </p>
            <div className="flex flex-col gap-2">
              <Link
                className="text-primary hover:underline"
                href="/demos/client-nav/settings"
              >
                → Go to Settings
              </Link>
              <Link
                className="text-primary hover:underline"
                href="/demos/client-nav/profile"
              >
                → Go to Profile
              </Link>
              <Link
                className="text-primary hover:underline"
                href="/demos/client-nav/analytics"
              >
                → Go to Analytics
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
