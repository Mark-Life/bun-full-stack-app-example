import { RootShell, type Metadata } from "./root-shell";
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
}

export default function RootLayout({
  children,
  routePath,
  hasClientComponents = true,
}: LayoutProps) {
  const shellProps = {
    metadata,
    hasClientComponents,
    children,
    ...(routePath !== undefined && { routePath }),
  };

  return <RootShell {...shellProps} />;
}
