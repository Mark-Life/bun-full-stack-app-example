import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/Link";

export const metadata = {
  title: "Documentation - Bun + React",
  description: "Documentation for the Bun + React app router",
};

export default function DocsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl font-bold">Documentation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>Welcome to the documentation section.</p>
        <p>
          This page demonstrates nested layouts - notice the sidebar on the left
          is provided by the docs layout.
        </p>
        <div className="pt-4">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

