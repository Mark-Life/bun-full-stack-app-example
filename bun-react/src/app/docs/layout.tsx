import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/link";

interface DocsLayoutProps {
  children: React.ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <div className="container mx-auto p-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <aside className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Documentation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href="/docs"
                className="block text-blue-600 hover:underline"
              >
                Overview
              </Link>
              <Link
                href="/docs/getting-started"
                className="block text-blue-600 hover:underline"
              >
                Getting Started
              </Link>
            </CardContent>
          </Card>
        </aside>
        <main className="md:col-span-3">{children}</main>
      </div>
    </div>
  );
}
