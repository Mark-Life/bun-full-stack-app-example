import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/Link";

export const metadata = {
  title: "About - Bun + React",
  description: "Learn more about this Bun + React application",
};

export default function AboutPage() {
  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            This is an example of a Next.js-style app router implemented with
            Bun and React.
          </p>
          <p>
            Features:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>File-based routing with app directory</li>
            <li>Support for both index.tsx and page.tsx route files</li>
            <li>Nested layouts</li>
            <li>Server-side rendering</li>
            <li>Metadata injection</li>
          </ul>
          <div className="pt-4">
            <Link href="/" className="text-blue-600 hover:underline">
              ← Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

