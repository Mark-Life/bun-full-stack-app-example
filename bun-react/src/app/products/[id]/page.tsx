import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { definePage } from "~/framework/shared/page";
import { getAllProductIds, getProductById } from "~/lib/products";

/**
 * Product detail page with ISR
 * Revalidates every hour
 */
export default definePage({
  type: "static",
  revalidate: 3600, // Revalidate every hour
  generateParams: async () => {
    const ids = await getAllProductIds();
    return ids.map((id) => ({ id }));
  },
  loader: async (params) => {
    if (!params?.id) {
      throw new Error("Product ID is required");
    }
    const product = await getProductById(params.id);
    if (!product) {
      throw new Error(`Product ${params.id} not found`);
    }
    return { product };
  },
  component: ({
    data,
  }: {
    data?: {
      product: {
        id: string;
        name: string;
        description: string;
        price: number;
        status: string;
      };
    } | null;
  }) => {
    const product = data?.product;

    if (!product) {
      return (
        <div className="container mx-auto p-8">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Product not found</p>
              <Link
                className="mt-4 text-primary hover:underline"
                href="/products"
              >
                ← Back to Products
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="container mx-auto p-8">
        <div className="mb-4 rounded-lg bg-muted p-4 text-muted-foreground text-sm">
          <p className="font-semibold">ISR Demo:</p>
          <p>
            This page is statically generated with ISR. It revalidates every
            hour. Check the{" "}
            <code className="rounded bg-accent px-1 text-accent-foreground">
              X-Cache
            </code>{" "}
            header in DevTools to see cache status (HIT/STALE/MISS).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-bold text-3xl">{product.name}</CardTitle>
            <CardDescription>Product ID: {product.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="mb-2 font-semibold text-muted-foreground text-sm">
                Route Pattern:
              </p>
              <code className="text-sm">/products/[id]</code>
            </div>

            <div className="border-t pt-4">
              <h2 className="mb-4 font-semibold text-xl">Product Details</h2>
              <div className="space-y-3">
                <div>
                  <span className="font-semibold">Name:</span> {product.name}
                </div>
                <div>
                  <span className="font-semibold">Description:</span>{" "}
                  {product.description}
                </div>
                <div>
                  <span className="font-semibold">Price:</span> $
                  {product.price.toFixed(2)}
                </div>
                <div>
                  <span className="font-semibold">Status:</span>{" "}
                  <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
                    {product.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 font-semibold text-sm">Other Products:</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="rounded bg-primary px-3 py-1 text-primary-foreground text-sm hover:bg-primary/90"
                  href="/products/1"
                >
                  Product 1
                </Link>
                <Link
                  className="rounded bg-primary px-3 py-1 text-primary-foreground text-sm hover:bg-primary/90"
                  href="/products/2"
                >
                  Product 2
                </Link>
                <Link
                  className="rounded bg-primary px-3 py-1 text-primary-foreground text-sm hover:bg-primary/90"
                  href="/products/3"
                >
                  Product 3
                </Link>
              </div>
            </div>

            <div className="border-t pt-4">
              <Link className="text-primary hover:underline" href="/products">
                ← Back to Products
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  },
});
