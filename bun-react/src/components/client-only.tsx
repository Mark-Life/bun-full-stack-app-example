import { type ReactNode, useEffect, useState } from "react";
import { clientComponent } from "~/framework/shared/rsc";

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wrapper component that only renders children on the client.
 * Useful for components with hydration mismatches (like Radix UI with auto-generated IDs)
 */
export const ClientOnly = clientComponent(
  ({ children, fallback = null }: ClientOnlyProps) => {
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
      setHasMounted(true);
    }, []);

    if (!hasMounted) {
      return <>{fallback}</>;
    }

    return <>{children}</>;
  }
);
