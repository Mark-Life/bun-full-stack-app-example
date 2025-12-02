import { ClientOnly } from "@/components/client-only";
import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APITester } from "./APITester";

export default function HomePage() {
  return (
    <div className="container relative z-10 mx-auto p-8 text-center">
      <div className="mb-8 flex items-center justify-center gap-8">
        <img
          alt="Bun Logo"
          className="h-36 scale-120 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]"
          height={144}
          src="/logo.svg"
          width={144}
        />
        <img
          alt="React Logo"
          className="h-36 animate-[spin_20s_linear_infinite] p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#61dafbaa]"
          height={144}
          src="/react.svg"
          width={144}
        />
      </div>
      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="font-bold text-3xl">Bun + React</CardTitle>
          <CardDescription>
            Edit{" "}
            <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono">
              src/app/page.tsx
            </code>{" "}
            and save to test HMR
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ClientOnly fallback={<div className="h-[200px]" />}>
            <APITester />
          </ClientOnly>
          <div className="border-t pt-4">
            <p className="mb-4 text-muted-foreground text-sm">
              Test the app router:
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                className="font-medium text-blue-600 hover:underline"
                href="/landing"
              >
                Landing (Static)
              </Link>
              <Link
                className="font-medium text-blue-600 hover:underline"
                href="/about"
              >
                About
              </Link>
              <Link
                className="font-medium text-blue-600 hover:underline"
                href="/docs"
              >
                Documentation
              </Link>
              <Link
                className="font-medium text-blue-600 hover:underline"
                href="/docs/getting-started"
              >
                Getting Started
              </Link>
              <Link
                className="font-medium text-blue-600 hover:underline"
                href="/suspense-demo"
              >
                Suspense Demo
              </Link>
              <Link
                className="font-medium text-purple-600 hover:underline"
                href="/dashboard"
              >
                Dashboard (Client Nav)
              </Link>
            </div>
          </div>
          <div className="border-t pt-4">
            <p className="mb-4 text-muted-foreground text-sm">
              Dynamic Routes:
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                className="font-medium text-green-600 hover:underline"
                href="/products"
              >
                Products (ISR)
              </Link>
              <Link
                className="font-medium text-green-600 hover:underline"
                href="/products/1"
              >
                [id] - Product Detail
              </Link>
              <Link
                className="font-medium text-orange-600 hover:underline"
                href="/admin/products"
              >
                Admin (Revalidate)
              </Link>
              <Link
                className="font-medium text-green-600 hover:underline"
                href="/catch-all/nested/path/example"
              >
                [...path] - Catch-All
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
