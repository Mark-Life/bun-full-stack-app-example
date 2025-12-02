import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { useRouter } from "~/framework/client/router";
import type { ValidRoutes } from "~/framework/shared/routes.generated";
import { clientComponent } from "~/framework/shared/rsc";

interface LinkProps {
  href: ValidRoutes;
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Client-side implementation that uses hooks
 */
const LinkImpl = ({ href, children, className, onClick }: LinkProps) => {
  const { navigate, currentPath } = useRouter();
  // Only compute isActive on client to avoid hydration mismatch
  // (server doesn't know the current path reliably)
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(currentPath === href);
  }, [currentPath, href]);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault(); // TODO: what if click before js is loaded?
    navigate(href);
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
