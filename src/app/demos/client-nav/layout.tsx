import { Link } from "@/components/link";
import { defineLayout } from "~/framework/shared/layout";

/**
 * Client navigation demo layout
 * All routes under /demos/client-nav will use SPA-style navigation
 */
export default defineLayout(({ children }) => (
  <div className="flex min-h-screen bg-background">
    {/* Sidebar */}
    <aside className="w-56 shrink-0 border-r bg-card">
      <div className="flex h-full flex-col p-4">
        <h2 className="mb-4 font-semibold text-muted-foreground text-sm uppercase tracking-wider">
          Client Navigation
        </h2>
        <nav className="flex flex-1 flex-col gap-2">
          <Link
            className="rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
            href="/demos/client-nav"
          >
            Home
          </Link>
          <Link
            className="rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
            href="/demos/client-nav/settings"
          >
            Settings
          </Link>
          <Link
            className="rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
            href="/demos/client-nav/profile"
          >
            Profile
          </Link>
          <Link
            className="rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
            href="/demos/client-nav/analytics"
          >
            Analytics
          </Link>
        </nav>
      </div>
    </aside>
    {/* Main content */}
    <main className="flex-1 p-8">{children}</main>
  </div>
));
