import { Link } from "@/components/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * 404 Not Found page component
 * This component is rendered when a route is not found
 */
export default function NotFound() {
  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="mb-4 font-bold text-6xl">404</CardTitle>
          <CardDescription className="text-lg">Page not found</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="pt-4">
            <Link
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
              href="/"
            >
              Go back home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
