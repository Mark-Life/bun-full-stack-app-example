import { Link } from "@/components/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useRouter } from "~/framework/client/router";
import { clientComponent } from "~/framework/shared/rsc";

/**
 * Available demo routes with their display names
 */
const DEMOS = [
  { path: "/demos/api", label: "API" },
  { path: "/demos/client-nav", label: "Client Navigation" },
  { path: "/demos/isr", label: "ISR" },
  { path: "/demos/ssr", label: "SSR" },
  { path: "/demos/static", label: "Static" },
  { path: "/demos/suspense", label: "Suspense" },
] as const;

/**
 * Extract demo name from current path
 */
const getDemoFromPath = (path: string): string | null => {
  for (const demo of DEMOS) {
    if (path === demo.path || path.startsWith(`${demo.path}/`)) {
      return demo.label;
    }
  }
  return null;
};

/**
 * Client component for demo breadcrumb with selector
 */
const DemoBreadcrumbImpl = () => {
  const { currentPath, navigate } = useRouter();
  const currentDemo = getDemoFromPath(currentPath);
  const currentDemoPath = DEMOS.find(
    (d) => currentPath === d.path || currentPath.startsWith(`${d.path}/`)
  )?.path;

  const handleValueChange = (value: string) => {
    navigate(value);
  };

  return (
    <div className="flex items-center gap-4">
      <Link className="font-semibold text-lg hover:text-primary" href="/">
        Bun React Framework
      </Link>
      <span className="text-muted-foreground">/</span>
      <a className="text-muted-foreground hover:text-foreground" href="/#demos">
        Demos
      </a>
      {currentDemo ? (
        <>
          <span className="text-muted-foreground">/</span>
          <Select
            onValueChange={handleValueChange}
            value={currentDemoPath ?? ""}
          >
            <SelectTrigger className="flex h-auto items-center border-none p-0 text-muted-foreground shadow-none hover:text-foreground focus:ring-0">
              {/* Show currentDemo directly - SelectValue doesn't SSR properly */}
              <span>{currentDemo}</span>
            </SelectTrigger>
            <SelectContent>
              {DEMOS.map((demo) => (
                <SelectItem key={demo.path} value={demo.path}>
                  {demo.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
    </div>
  );
};

export const DemoBreadcrumb = clientComponent(DemoBreadcrumbImpl);
