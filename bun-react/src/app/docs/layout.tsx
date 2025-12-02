import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/link";

interface DocsLayoutProps {
  children: React.ReactNode;
}

const docLinks = [
  { href: "/docs", label: "Introduction" },
  { href: "/docs/getting-started", label: "Getting Started" },
  { href: "/demos/ssr", label: "Server-Side Rendering" },
  { href: "/demos/static", label: "Static Generation" },
  { href: "/demos/isr", label: "Incremental Static Regeneration" },
  { href: "/demos/api", label: "API Routes" },
  { href: "/demos/client-nav", label: "Client Navigation" },
] as const;

export default function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <div className="container mx-auto p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <aside className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Documentation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {docLinks.map((link) => (
                <Link
                  key={link.href}
                  className="block text-muted-foreground hover:text-foreground hover:underline"
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </aside>
        <main className="md:col-span-3">{children}</main>
      </div>
    </div>
  );
}
