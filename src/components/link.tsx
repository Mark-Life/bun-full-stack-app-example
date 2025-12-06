import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "~/framework/client/router";
import type { ValidRoutes } from "~/framework/shared/routes.generated";
import { clientComponent } from "~/framework/shared/rsc";

interface LinkProps {
  href: ValidRoutes;
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
}

/**
 * Check if data-saver mode is enabled
 */
const isDataSaverEnabled = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  return connection?.saveData === true;
};

/**
 * Client-side implementation that uses hooks
 */
const LinkImpl = ({
  href,
  children,
  className,
  onClick,
  replace,
  scroll,
  prefetch: shouldPrefetch = true,
}: LinkProps) => {
  const { navigate, currentPath, prefetch } = useRouter();
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const hasPrefetchedRef = useRef(false);

  // Only compute isActive on client to avoid hydration mismatch
  // (server doesn't know the current path reliably)
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(currentPath === href);
  }, [currentPath, href]);

  /**
   * Perform prefetch if enabled and conditions are met
   */
  const doPrefetch = useCallback((): void => {
    if (!shouldPrefetch) {
      return;
    }

    if (hasPrefetchedRef.current) {
      return;
    }

    if (isDataSaverEnabled()) {
      return;
    }

    // Don't prefetch if already on this route
    if (currentPath === href) {
      return;
    }

    // Don't prefetch external URLs
    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    prefetch(href);
    hasPrefetchedRef.current = true;
  }, [shouldPrefetch, currentPath, href, prefetch]);

  /**
   * Handle mouse enter for hover prefetching
   */
  const handleMouseEnter = (): void => {
    if (!shouldPrefetch) {
      return;
    }

    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Prefetch after 100ms hover delay
    hoverTimeoutRef.current = setTimeout(() => {
      doPrefetch();
    }, 100);
  };

  /**
   * Handle mouse leave - cancel prefetch if not completed
   */
  const handleMouseLeave = (): void => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  /**
   * Set up IntersectionObserver for viewport prefetching
   */
  useEffect(() => {
    if (!shouldPrefetch) {
      return;
    }

    if (typeof window === "undefined" || !linkRef.current) {
      return;
    }

    if (isDataSaverEnabled()) {
      return;
    }

    // Don't prefetch if already on this route
    if (currentPath === href) {
      return;
    }

    // Don't prefetch external URLs
    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            doPrefetch();
            observer.disconnect();
            break;
          }
        }
      },
      {
        // Prefetch when link is near viewport (200px threshold)
        rootMargin: "200px",
      }
    );

    observer.observe(linkRef.current);

    return () => {
      observer.disconnect();
    };
  }, [shouldPrefetch, currentPath, href, doPrefetch]);

  /**
   * Cleanup timeout on unmount
   */
  useEffect(
    () => () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    },
    []
  );

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Handle external URLs and modifier keys
    const isExternal =
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:");
    const isModifierKey = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;

    if (isExternal || isModifierKey) {
      // Let browser handle external links and modifier keys
      return;
    }

    e.preventDefault();

    // Use client navigation
    const options: { replace?: boolean; scroll?: boolean } = {};
    if (replace !== undefined) {
      options.replace = replace;
    }
    if (scroll !== undefined) {
      options.scroll = scroll;
    }
    navigate(href, options);

    onClick?.(e);
  };

  return (
    <a
      ref={linkRef}
      {...(isActive ? { "aria-current": "page" } : {})}
      className={className}
      href={href}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
  ({
    href,
    children,
    className,
    onClick,
    replace,
    scroll,
    prefetch,
  }: LinkProps) => {
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
      ...(replace !== undefined && { replace }),
      ...(scroll !== undefined && { scroll }),
      ...(prefetch !== undefined && { prefetch }),
    };
    return <LinkImpl {...linkProps} />;
  }
);
