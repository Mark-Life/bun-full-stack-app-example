/**
 * Root HTML shell component that wraps all pages
 * Handles metadata injection, default styles, and hydration script
 */
export interface Metadata {
  title?: string;
  description?: string;
  viewport?: string;
}

interface RootShellProps {
  children: React.ReactNode;
  metadata?: Metadata;
  routePath?: string;
}

export const RootShell = ({
  children,
  metadata,
  routePath,
}: RootShellProps) => {
  const title = metadata?.title || "Bun + React";
  const description =
    metadata?.description ||
    "A full-stack application built with Bun and React";
  const viewport =
    metadata?.viewport || "width=device-width, initial-scale=1.0";

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
            __html: JSON.stringify({ routePath: routePath || "/" }),
          }}
        />
        <script type="module" src="/hydrate.js" async />
      </body>
    </html>
  );
};
