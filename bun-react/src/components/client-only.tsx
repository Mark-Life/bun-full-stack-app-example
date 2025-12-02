import { type ReactNode, useEffect, useState } from "react";
import { clientComponent } from "~/framework/shared/rsc";

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Client-side implementation that uses hooks
 */
const ClientOnlyImpl = ({ children, fallback = null }: ClientOnlyProps) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

/**
 * Wrapper component that only renders children on the client.
 * Useful for components with hydration mismatches (like Radix UI with auto-generated IDs)
 *
 * On the server, returns fallback without executing client code.
 * On the client, uses hooks to track mount state.
 */
export const ClientOnly = clientComponent(
  ({ children, fallback = null }: ClientOnlyProps) => {
    // On server, return fallback immediately without executing client code
    if (typeof window === "undefined") {
      return <>{fallback}</>;
    }

    // On client, render the hook-based implementation
    return <ClientOnlyImpl fallback={fallback}>{children}</ClientOnlyImpl>;
  }
);
