import { Link } from "@/components/link";
import { defineLayout } from "~/framework/shared/layout";

/**
 * Dashboard layout with client-side navigation enabled
 * All routes under /dashboard will use SPA-style navigation
 */
export default defineLayout({
  clientNavigation: true,
  component: ({ children }) => (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card shadow-sm">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center justify-between">
            <h1 className="font-bold text-foreground text-xl">Dashboard</h1>
            <div className="flex gap-4">
              <Link
                className="text-muted-foreground hover:text-foreground hover:underline"
                href="/dashboard"
              >
                Home
              </Link>
              <Link
                className="text-muted-foreground hover:text-foreground hover:underline"
                href="/dashboard/settings"
              >
                Settings
              </Link>
              <Link
                className="text-muted-foreground hover:text-foreground hover:underline"
                href="/dashboard/profile"
              >
                Profile
              </Link>
              <Link
                className="text-muted-foreground hover:text-foreground hover:underline"
                href="/dashboard/analytics"
              >
                Analytics
              </Link>
              <Link
                className="text-primary hover:text-primary/80 hover:underline"
                href="/"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl p-8">{children}</main>
    </div>
  ),
});
