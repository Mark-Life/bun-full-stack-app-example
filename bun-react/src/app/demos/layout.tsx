import { Link } from "@/components/link";
import { defineLayout } from "~/framework/shared/layout";

/**
 * Shared layout for all demo pages
 * This is a server component - simple wrapper with no async data
 */
const DemosLayoutComponent = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link className="font-semibold text-lg hover:text-primary" href="/">
              Bun React Framework
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">Demos</span>
          </div>
        </div>
      </div>
    </header>
    <main className="container mx-auto max-w-6xl px-4 py-8">{children}</main>
  </div>
);

export default defineLayout({
  component: DemosLayoutComponent,
});
