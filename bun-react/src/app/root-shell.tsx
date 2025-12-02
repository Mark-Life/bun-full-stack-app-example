/**
 * Root HTML shell component that wraps all pages
 * Handles metadata injection, default styles, and hydration script
 */
export interface Metadata {
  title?: string;
  description?: string;
  viewport?: string;
}

/**
 * Route data passed to the client for hydration
 */
export interface RouteData {
  routePath: string;
  /** Whether the page tree has any client components that need hydration */
  hasClientComponents: boolean;
}

interface RootShellProps {
  children: React.ReactNode;
  metadata?: Metadata;
  routePath?: string;
  /** Whether this route has client components needing hydration */
  hasClientComponents?: boolean;
}

export const RootShell = ({
  children,
  metadata,
  routePath,
  hasClientComponents = true,
}: RootShellProps) => {
  const title = metadata?.title || "Bun + React";
  const description =
    metadata?.description ||
    "A full-stack application built with Bun and React";
  const viewport =
    metadata?.viewport || "width=device-width, initial-scale=1.0";

  const routeData: RouteData = {
    routePath: routePath || "/",
    hasClientComponents,
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content={viewport} />
        <meta name="description" content={description} />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="stylesheet" href="/index.css" />
      </head>
      <body>
        <div id="root">{children}</div>
        <script
          id="__ROUTE_DATA__"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(routeData),
          }}
        />
        {/* Only include hydration script if there are client components */}
        {hasClientComponents && (
          <script type="module" src="/hydrate.js" async />
        )}
      </body>
    </html>
  );
};
