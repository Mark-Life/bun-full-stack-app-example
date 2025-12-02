import { useCallback, useEffect, useState } from "react";
import { Link } from "@/components/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "~/api-client";
import { clientComponent } from "~/framework/shared/rsc";
import type { Product } from "~/lib/products";

/**
 * Admin page to manage products and trigger ISR revalidation
 */
const AdminProductsPage = clientComponent(() => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    status: "live" as "draft" | "live",
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState({
    title: "",
    description: "",
  });

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      console.log("[Admin] Loading products from /api/products/list...");

      // Add timeout to prevent infinite hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error("[Admin] Request timeout after 5 seconds");
        controller.abort();
      }, 5000);

      // Use direct fetch with timeout
      const response = await fetch("/api/products/list", {
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      clearTimeout(timeoutId);

      console.log(
        "[Admin] Response received:",
        response.status,
        response.statusText
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Admin] API error:", response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const productsData = (await response.json()) as Product[];
      console.log("[Admin] Products loaded:", productsData);

      if (Array.isArray(productsData)) {
        setProducts(productsData);
      } else {
        console.error("[Admin] Invalid products data format:", productsData);
        setProducts([]);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("[Admin] Request aborted due to timeout");
      } else {
        console.error("[Admin] Failed to load products:", error);
      }
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load products
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleEdit = (product: Product) => {
    setEditing(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      status: product.status,
    });
  };

  const handleSave = async () => {
    if (!editing) {
      return;
    }

    try {
      const updated = (await (
        apiClient.products.update as (input: {
          params: { id: string };
          name?: string;
          description?: string;
          price?: number;
          status?: "draft" | "live";
        }) => Promise<Product | null>
      )({
        params: { id: editing.id },
        name: formData.name,
        description: formData.description,
        price: Number.parseFloat(formData.price),
        status: formData.status,
      })) as Product | null;

      if (updated) {
        // Update local state
        const updatedProducts = products.map((p) =>
          p.id === editing.id ? updated : p
        );
        setProducts(updatedProducts);
        setEditing(null);

        // Trigger revalidation
        await handleRevalidate(`/products/${editing.id}`);
        await handleRevalidate("/products");
      }
    } catch (error) {
      console.error("Failed to update product:", error);
      setDialogMessage({
        title: "Update Failed",
        description: "Failed to update product. Check console for details.",
      });
      setDialogOpen(true);
    }
  };

  const handleRevalidate = async (path: string) => {
    try {
      setRevalidating(path);
      // In production, set REVALIDATE_SECRET environment variable
      // For demo purposes, using a default secret
      await (
        apiClient.revalidate as (input: {
          path: string;
          secret: string;
        }) => Promise<unknown>
      )({
        path,
        secret: "demo-secret", // Replace with actual secret in production
      });
      setDialogMessage({
        title: "Revalidation Successful",
        description: `Successfully revalidated: ${path}`,
      });
      setDialogOpen(true);
    } catch (error) {
      console.error("Failed to revalidate:", error);
      setDialogMessage({
        title: "Revalidation Failed",
        description: `Failed to revalidate ${path}. Check console for details.`,
      });
      setDialogOpen(true);
    } finally {
      setRevalidating(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">Loading products...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-2 font-bold text-4xl">Product Management</h1>
          <p className="text-muted-foreground">
            Update products and trigger ISR revalidation
          </p>
        </div>
        <Link
          className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          href="/products"
        >
          View Products
        </Link>
      </div>

      <div className="mb-6 rounded-lg bg-muted p-4 text-muted-foreground text-sm">
        <p className="font-semibold">ISR Revalidation Demo:</p>
        <p>
          When you update a product, click "Revalidate" to trigger on-demand
          ISR. This will regenerate the cached page immediately. Set{" "}
          <code className="rounded bg-accent px-1 text-accent-foreground">
            REVALIDATE_SECRET
          </code>{" "}
          environment variable for production use.
        </p>
      </div>

      {editing ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Edit Product: {editing.name}</CardTitle>
            <CardDescription>Update product details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                value={formData.name}
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                value={formData.description}
              />
            </div>
            <div>
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                step="0.01"
                type="number"
                value={formData.price}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                onValueChange={(value: "draft" | "live") =>
                  setFormData({ ...formData, status: value })
                }
                value={formData.status}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave}>Save Changes</Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormData({
                    name: "",
                    description: "",
                    price: "",
                    status: "live",
                  });
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>{product.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEdit(product)}
                    size="sm"
                    variant="outline"
                  >
                    Edit
                  </Button>
                  <Button
                    disabled={revalidating === `/products/${product.id}`}
                    onClick={() => handleRevalidate(`/products/${product.id}`)}
                    size="sm"
                  >
                    {revalidating === `/products/${product.id}`
                      ? "Revalidating..."
                      : "Revalidate"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-2xl">
                    ${product.price.toFixed(2)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Status:{" "}
                    <span
                      className={
                        product.status === "live"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }
                    >
                      {product.status}
                    </span>
                  </p>
                </div>
                <Link
                  className="text-primary hover:underline"
                  href={`/products/${product.id}`}
                >
                  View →
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          disabled={revalidating === "/products"}
          onClick={() => handleRevalidate("/products")}
        >
          {revalidating === "/products"
            ? "Revalidating..."
            : "Revalidate Products List"}
        </Button>
      </div>

      <div className="mt-8">
        <Link className="text-primary hover:underline" href="/">
          ← Back to Home
        </Link>
      </div>

      <AlertDialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogMessage.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogMessage.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDialogOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export default AdminProductsPage;
