import { RootShell, type Metadata } from "./root-shell";
import "../index.css";

export const metadata: Metadata = {
  title: "Bun + React",
  description: "A full-stack application built with Bun and React",
};

interface LayoutProps {
  children: React.ReactNode;
  routePath?: string;
}

export default function RootLayout({ children, routePath }: LayoutProps) {
  const shellProps = routePath
    ? { metadata, routePath, children }
    : { metadata, children };
  return <RootShell {...shellProps} />;
}
