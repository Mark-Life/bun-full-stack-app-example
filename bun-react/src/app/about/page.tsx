import { Link } from "@/components/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "About - Bun + React",
  description: "Learn more about this Bun + React application",
};

export default function AboutPage() {
  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-bold text-3xl">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            This is an example of a Next.js-style app router implemented with
            Bun and React.
          </p>
          <p>Features:</p>
          <ul className="ml-4 list-inside list-disc space-y-2">
            <li>File-based routing with app directory</li>
            <li>Support for both index.tsx and page.tsx route files</li>
            <li>Nested layouts</li>
            <li>Server-side rendering</li>
            <li>Metadata injection</li>
          </ul>
          <div className="pt-4">
            <Link className="text-blue-600 hover:underline" href="/">
              ← Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
