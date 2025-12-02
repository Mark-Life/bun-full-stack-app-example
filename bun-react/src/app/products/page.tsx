import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { definePage } from "~/framework/shared/page";
import { getAllProducts, type Product } from "~/lib/products";

/**
 * Products listing page with ISR
 * Revalidates every 60 seconds
 */
export default definePage({
  type: "static",
  revalidate: 60, // Revalidate every minute
  loader: async () => {
    const products = await getAllProducts();
    return { products };
  },
  component: ({ data }: { data?: { products: Product[] } | null }) => {
    const { products } = data || { products: [] };

    return (
      <div className="container mx-auto p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="mb-2 font-bold text-4xl">Products</h1>
            <p className="text-muted-foreground">
              ISR-enabled page (revalidates every 60 seconds)
            </p>
          </div>
          <Link
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            href="/admin/products"
          >
            Manage Products
          </Link>
        </div>

        <div className="mb-4 rounded-lg bg-blue-50 p-4 text-blue-900 text-sm dark:bg-blue-900/20 dark:text-blue-200">
          <p className="font-semibold">ISR Demo:</p>
          <p>
            This page is statically generated with ISR. It revalidates every 60
            seconds. Check the{" "}
            <code className="rounded bg-blue-100 px-1 dark:bg-blue-800">
              X-Cache
            </code>{" "}
            header in DevTools to see cache status (HIT/STALE/MISS).
          </p>
        </div>

        {products.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No products available
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Link href={`/products/${product.id}`} key={product.id}>
                <Card className="transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <CardTitle>{product.name}</CardTitle>
                    <CardDescription>{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="font-bold text-2xl">
                      ${product.price.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Link className="text-blue-600 hover:underline" href="/">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  },
});
