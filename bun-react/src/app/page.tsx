import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientOnly } from "@/components/client-only";
import { APITester } from "./APITester";
import { Link } from "@/components/link";

export default function HomePage() {
  return (
    <div className="container mx-auto p-8 text-center relative z-10">
      <div className="flex justify-center items-center gap-8 mb-8">
        <img
          src="/logo.svg"
          alt="Bun Logo"
          className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa] scale-120"
        />
        <img
          src="/react.svg"
          alt="React Logo"
          className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#61dafbaa] [animation:spin_20s_linear_infinite]"
        />
      </div>
      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-3xl font-bold">Bun + React</CardTitle>
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
          <div className="pt-4 border-t">
            <p className="mb-4 text-sm text-muted-foreground">
              Test the app router:
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/about"
                className="text-blue-600 hover:underline font-medium"
              >
                About
              </Link>
              <Link
                href="/docs"
                className="text-blue-600 hover:underline font-medium"
              >
                Documentation
              </Link>
              <Link
                href="/docs/getting-started"
                className="text-blue-600 hover:underline font-medium"
              >
                Getting Started
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
