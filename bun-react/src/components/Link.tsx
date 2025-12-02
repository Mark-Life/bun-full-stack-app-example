"use client";

import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { useRouter } from "~/framework/client/router";

interface LinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Next.js-style Link component for client-side navigation
 * Works during SSR and when RouterProvider is not available
 */
export const Link = ({ href, children, className, onClick }: LinkProps) => {
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
      aria-current={isActive ? "page" : undefined}
      className={className}
      href={href}
      onClick={handleClick}
    >
      {children}
    </a>
  );
};
