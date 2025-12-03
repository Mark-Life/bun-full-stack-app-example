import { routes } from "virtual:routes";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { useClientNavigation, useRouter } from "~/framework/client/router";
import type { ValidRoutes } from "~/framework/shared/routes.generated";
import { clientComponent } from "~/framework/shared/rsc";

interface LinkProps {
  href: ValidRoutes;
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Match a route pattern against a URL path (simplified version for Link)
 */
const matchRoutePattern = (pattern: string, urlPath: string): boolean => {
  const patternParts = pattern.split("/").filter(Boolean);
  const urlParts = urlPath.split("/").filter(Boolean);

  // Handle catch-all routes
  if (
    patternParts.length > 0 &&
    patternParts[patternParts.length - 1]?.startsWith("*")
  ) {
    return urlParts.length >= patternParts.length - 1;
  }

  // Regular matching
  if (patternParts.length !== urlParts.length) {
    return false;
  }

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
    const urlPart = urlParts[i];

    if (!patternPart.startsWith(":") && patternPart !== urlPart) {
      return false;
    }
  }

  return true;
};

/**
 * Check if a path matches a route and get its config
 */
const getRouteConfig = (path: string) => {
  const normalizedPath = path === "/" ? "/" : path.replace(/\/$/, "") || "/";

  // Exact match
  if (routes[normalizedPath]) {
    return routes[normalizedPath];
  }

  // Try with trailing slash
  const withSlash = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  if (routes[withSlash]) {
    return routes[withSlash];
  }

  // Try dynamic routes
  for (const [pattern, routeConfig] of Object.entries(routes)) {
    if (routeConfig.isDynamic && matchRoutePattern(pattern, normalizedPath)) {
      return routeConfig;
    }
  }

  return null;
};

/**
 * Client-side implementation that uses hooks
 */
const LinkImpl = ({ href, children, className, onClick }: LinkProps) => {
  const { navigate, currentPath } = useRouter();
  const clientNav = useClientNavigation();

  // Only compute isActive on client to avoid hydration mismatch
  // (server doesn't know the current path reliably)
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(currentPath === href);
  }, [currentPath, href]);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    // Check if both routes are client-navigable
    const currentRoute = getRouteConfig(currentPath);
    const targetRoute = getRouteConfig(href);

    const bothClientNavigable =
      currentRoute?.clientNavigable && targetRoute?.clientNavigable;

    // Use client navigation if we're in a client-navigable context and both routes are client-navigable
    if (clientNav?.isClientNavigable && bothClientNavigable) {
      clientNav.navigate(href);
    } else {
      // Use regular navigation (will be handled by RouterProvider or full page reload)
      navigate(href);
    }

    onClick?.(e);
  };

  return (
    <a
      {...(isActive ? { "aria-current": "page" } : {})}
      className={className}
      href={href}
      onClick={handleClick}
    >
      {children}
    </a>
  );
};

/**
 * Next.js-style Link component for client-side navigation
 * Works during SSR and when RouterProvider is not available
 */
export const Link = clientComponent(
  ({ href, children, className, onClick }: LinkProps) => {
    // On server, return a simple anchor tag without calling hooks
    if (typeof window === "undefined") {
      return (
        <a className={className} href={href}>
          {children}
        </a>
      );
    }

    // On client, render the hook-based implementation
    const linkProps: LinkProps = {
      href,
      children,
      ...(className !== undefined && { className }),
      ...(onClick !== undefined && { onClick }),
    };
    return <LinkImpl {...linkProps} />;
  }
);
