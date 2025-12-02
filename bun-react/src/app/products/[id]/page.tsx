import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Page component props with dynamic route params
 */
interface ProductPageProps {
  params?: {
    id: string;
  };
}

/**
 * Example page demonstrating single dynamic route parameter [id]
 *
 * This page matches routes like:
 * - /products/123
 * - /products/abc
 * - /products/any-string
 */
export default function ProductPage({ params }: ProductPageProps) {
  // Ensure params exists and has id, with fallback
  const { id = "" } = params || {};

  // Simulate product data lookup
  const productData = {
    id,
    name: `Product ${id}`,
    description: `This is a demo product with ID: ${id}`,
    price: (Number.parseInt(id, 10) || 100) * 10,
  };

  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-bold text-3xl">
            Dynamic Route: [id]
          </CardTitle>
          <CardDescription>Single dynamic segment example</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="font-semibold text-muted-foreground text-sm">
              Route Pattern:
            </p>
            <code className="text-sm">/products/[id]</code>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="font-semibold text-muted-foreground text-sm">
              Current URL:
            </p>
            <code className="text-sm">/products/{id}</code>
          </div>

          <div className="border-t pt-4">
            <h2 className="mb-2 font-semibold text-xl">Product Details</h2>
            <div className="space-y-2">
              <p>
                <span className="font-semibold">ID:</span> {productData.id}
              </p>
              <p>
                <span className="font-semibold">Name:</span> {productData.name}
              </p>
              <p>
                <span className="font-semibold">Description:</span>{" "}
                {productData.description}
              </p>
              <p>
                <span className="font-semibold">Price:</span> $
                {productData.price.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="mb-2 font-semibold text-sm">Try different IDs:</p>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                href="/products/1"
              >
                Product 1
              </Link>
              <Link
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                href="/products/42"
              >
                Product 42
              </Link>
              <Link
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                href="/products/abc"
              >
                Product abc
              </Link>
              <Link
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                href="/products/xyz-123"
              >
                Product xyz-123
              </Link>
            </div>
          </div>

          <div className="border-t pt-4">
            <Link className="text-blue-600 hover:underline" href="/">
              ← Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
