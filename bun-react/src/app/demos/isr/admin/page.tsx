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
 * ISR Demo - Admin page to manage products and trigger ISR revalidation
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 5000);

      const response = await fetch("/api/products/list", {
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const productsData = (await response.json()) as Product[];
      if (Array.isArray(productsData)) {
        setProducts(productsData);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error("[Admin] Failed to load products:", error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
        const updatedProducts = products.map((p) =>
          p.id === editing.id ? updated : p
        );
        setProducts(updatedProducts);
        setEditing(null);

        await handleRevalidate(`/demos/isr/${editing.id}`);
        await handleRevalidate("/demos/isr");
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
      await (
        apiClient.revalidate as (input: {
          path: string;
          secret: string;
        }) => Promise<unknown>
      )({
        path,
        secret: "demo-secret",
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
      <div className="space-y-8">
        <p className="text-muted-foreground">Loading products...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 font-bold text-4xl">Product Management</h1>
          <p className="text-muted-foreground">
            Update products and trigger on-demand ISR revalidation
          </p>
        </div>
        <Link
          className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          href="/demos/isr"
        >
          View Products
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>On-Demand Revalidation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-muted-foreground text-sm">
            When you update a product, click &quot;Revalidate&quot; to trigger
            on-demand ISR. This will regenerate the cached page immediately.
            Check the{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              X-Cache
            </code>{" "}
            header after revalidation to see the fresh content.
          </p>
        </CardContent>
      </Card>

      {editing ? (
        <Card>
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
                    disabled={revalidating === `/demos/isr/${product.id}`}
                    onClick={() => handleRevalidate(`/demos/isr/${product.id}`)}
                    size="sm"
                  >
                    {revalidating === `/demos/isr/${product.id}`
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
                  href={`/demos/isr/${product.id}`}
                >
                  View →
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          disabled={revalidating === "/demos/isr"}
          onClick={() => handleRevalidate("/demos/isr")}
        >
          {revalidating === "/demos/isr"
            ? "Revalidating..."
            : "Revalidate Products List"}
        </Button>
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
