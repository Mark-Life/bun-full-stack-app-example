/**
 * Simple in-memory product store for ISR demo
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  status: "draft" | "live";
  updatedAt: number;
}

/**
 * In-memory product store
 */
const products: Product[] = [
  {
    id: "1",
    name: "Wireless Headphones",
    description: "High-quality wireless headphones with noise cancellation",
    price: 199.99,
    status: "live",
    updatedAt: Date.now(),
  },
  {
    id: "2",
    name: "Smart Watch",
    description: "Feature-rich smartwatch with health tracking",
    price: 299.99,
    status: "live",
    updatedAt: Date.now(),
  },
  {
    id: "3",
    name: "USB-C Cable",
    description: "Durable USB-C charging cable, 6ft length",
    price: 19.99,
    status: "live",
    updatedAt: Date.now(),
  },
];

/**
 * Get all products
 */
export const getAllProducts = async (): Promise<Product[]> => {
  // Simulate async operation
  await new Promise((resolve) => setTimeout(resolve, 100));
  return products.filter((p) => p.status === "live");
};

/**
 * Get product by ID
 */
export const getProductById = async (id: string): Promise<Product | null> => {
  // Simulate async operation
  await new Promise((resolve) => setTimeout(resolve, 50));
  return products.find((p) => p.id === id) || null;
};

/**
 * Get all product IDs (for generateParams)
 */
export const getAllProductIds = async (): Promise<string[]> => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return products.filter((p) => p.status === "live").map((p) => p.id);
};

/**
 * Update product
 */
export const updateProduct = async (
  id: string,
  updates: Partial<Omit<Product, "id" | "updatedAt">>
): Promise<Product | null> => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const product = products.find((p) => p.id === id);
  if (!product) {
    return null;
  }

  Object.assign(product, updates, { updatedAt: Date.now() });
  return product;
};

/**
 * Get all products (including drafts) - for admin
 */
export const getAllProductsAdmin = async (): Promise<Product[]> => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return [...products];
};
