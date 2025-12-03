import { type Metadata, RootShell } from "~/framework/shared/root-shell";
import "../index.css";

export const metadata: Metadata = {
  title: "Bun + React",
  description: "A full-stack application built with Bun and React",
};

interface LayoutProps {
  children: React.ReactNode;
  routePath?: string;
  /** Whether the route has client components needing hydration */
  hasClientComponents?: boolean;
  /** Page data from loader (for hydration) */
  pageData?: unknown;
}

export default function RootLayout({
  children,
  routePath,
  hasClientComponents = true,
  pageData,
}: LayoutProps) {
  const shellProps = {
    metadata,
    hasClientComponents,
    children,
    ...(routePath !== undefined && { routePath }),
    ...(pageData !== undefined && { pageData }),
  };

  return <RootShell {...shellProps} />;
}
