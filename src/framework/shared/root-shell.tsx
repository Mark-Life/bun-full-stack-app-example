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
  /** Page data from loader (for server component pages that need hydration) */
  pageData?: unknown;
}

interface RootShellProps {
  children: React.ReactNode;
  metadata?: Metadata;
  routePath?: string;
  /** Whether this route has client components needing hydration */
  hasClientComponents?: boolean;
  /** Page data from loader (for hydration) */
  pageData?: unknown;
}

export const RootShell = ({
  children,
  metadata,
  routePath,
  hasClientComponents = true,
  pageData,
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
    ...(pageData !== undefined && { pageData }),
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta content={viewport} name="viewport" />
        <meta content={description} name="description" />
        <title>{title}</title>
        <link href="/logo.svg" rel="icon" type="image/svg+xml" />
        <link href="/index.css" rel="stylesheet" />
      </head>
      <body>
        <div id="root">{children}</div>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: here we are setting the route data
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(routeData),
          }}
          id="__ROUTE_DATA__"
          type="application/json"
        />
        {/* Hydration script is injected via bootstrapModules in renderToReadableStream */}
        {process.env.NODE_ENV !== "production" && (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: HMR script injection required for dev mode
            dangerouslySetInnerHTML={{
              __html: `
      (function() {
        if (typeof window === 'undefined') return;
        
        let ws;
        let reconnectTimeout;
        let wasConnected = false;
        
        const connectHMR = () => {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          ws = new WebSocket(protocol + '//' + window.location.host + '/hmr');
          
          ws.onopen = () => {
            console.log('[HMR] Connected');
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = null;
            }
            // If we were connected before, server restarted - reload page
            if (wasConnected) {
              console.log('[HMR] Server restarted, reloading...');
              window.location.reload();
              return;
            }
            wasConnected = true;
          };
          
          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              if (message.type === 'hmr-update') {
                console.log('[HMR] File changed:', message.file);
                
                // Hot-swap CSS files without page reload
                if (message.file.endsWith('.css')) {
                  const links = document.querySelectorAll('link[rel="stylesheet"]');
                  links.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href) {
                      const newHref = href.split('?')[0] + '?t=' + Date.now();
                      link.setAttribute('href', newHref);
                    }
                  });
                } else {
                  // Reload page for JS/TS/route changes
                  window.location.reload();
                }
              }
            } catch (e) {
              // Ignore non-JSON messages
            }
          };
          
          ws.onerror = (error) => {
            console.error('[HMR] WebSocket error:', error);
          };
          
          ws.onclose = () => {
            console.log('[HMR] Disconnected, reconnecting...');
            reconnectTimeout = setTimeout(() => {
              connectHMR();
            }, 1000);
          };
        };
        
        connectHMR();
      })();
    `,
            }}
          />
        )}
      </body>
    </html>
  );
};
