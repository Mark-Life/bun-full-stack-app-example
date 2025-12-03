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
 * ISR Demo - Products listing page
 * Revalidates every hour
 */
export default definePage({
  type: "static",
  revalidate: 3600, // Revalidate every hour
  loader: async () => {
    const products = await getAllProducts();
    return { products };
  },
  component: ({ data }: { data?: { products: Product[] } | null }) => {
    const { products } = data || { products: [] };

    return (
      <div className="space-y-8">
        <div>
          <h1 className="mb-4 font-bold text-4xl">
            Incremental Static Regeneration
          </h1>
          <p className="text-lg text-muted-foreground">
            This page is statically generated with ISR. It revalidates every
            hour. Check the{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              X-Cache
            </code>{" "}
            header in DevTools to see cache status (HIT/STALE/MISS). Check
            server logs to verify static serving vs rendering.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How ISR Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
              <li>
                First request: Page is rendered and cached (served with{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  X-Cache: MISS
                </code>
                )
              </li>
              <li>
                Subsequent requests: If cache is fresh (&lt; 1h old), served
                from cache (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  X-Cache: HIT
                </code>
                ) - no server rendering, pure static serving
              </li>
              <li>
                Stale cache: If cache is stale, served stale content (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  X-Cache: STALE
                </code>
                ) while regenerating in background
              </li>
              <li>
                Background revalidation: Stale pages are regenerated
                automatically
              </li>
            </ol>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-2xl">Products</h2>
          <Link
            className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            href="/demos/isr/admin"
          >
            Manage Products
          </Link>
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
              <Link
                className="h-full"
                href={`/demos/isr/${product.id}`}
                key={product.id}
              >
                <Card className="flex h-full flex-col transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <CardTitle>{product.name}</CardTitle>
                    <CardDescription>{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-end">
                    <p className="font-bold text-2xl">
                      ${product.price.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  },
});
