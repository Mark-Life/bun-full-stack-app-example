"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import {
	type ComponentProps,
	type HTMLAttributes,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from "shiki";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
	code: string;
	language: BundledLanguage;
	showLineNumbers?: boolean;
	children?: ReactNode;
};

const lineNumberTransformer: ShikiTransformer = {
	name: "line-numbers",
	line(node, line) {
		node.children.unshift({
			type: "element",
			tagName: "span",
			properties: {
				className: [
					"inline-block",
					"min-w-10",
					"mr-4",
					"text-right",
					"select-none",
					"text-muted-foreground",
				],
			},
			children: [{ type: "text", value: String(line) }],
		});
	},
};

export async function highlightCode(
	code: string,
	language: BundledLanguage,
	showLineNumbers = false,
) {
	const transformers: ShikiTransformer[] = showLineNumbers
		? [lineNumberTransformer]
		: [];

	return await Promise.all([
		codeToHtml(code, {
			lang: language,
			theme: "one-light",
			transformers,
		}),
		codeToHtml(code, {
			lang: language,
			theme: "one-dark-pro",
			transformers,
		}),
	]);
}

/**
 * Code block component with syntax highlighting.
 * Shows raw code during SSR, highlights on client.
 */
export const CodeBlock = ({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
	...props
}: CodeBlockProps) => {
	const [lightHtml, setLightHtml] = useState<string>("");
	const [darkHtml, setDarkHtml] = useState<string>("");
	const [isHighlighted, setIsHighlighted] = useState(false);

	useEffect(() => {
		let cancelled = false;
		highlightCode(code, language, showLineNumbers).then(([light, dark]) => {
			if (!cancelled) {
				setLightHtml(light);
				setDarkHtml(dark);
				setIsHighlighted(true);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [code, language, showLineNumbers]);

	return (
		<div
			className={cn(
				"group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
				className,
			)}
			{...props}
		>
			<div className="relative">
				{isHighlighted ? (
					<>
						<div
							className="dark:hidden [&>pre]:m-0 [&>pre]:whitespace-pre-wrap [&>pre]:wrap-break-word [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: Required for Shiki HTML output
							dangerouslySetInnerHTML={{ __html: lightHtml }}
						/>
						<div
							className="hidden dark:block [&>pre]:m-0 [&>pre]:whitespace-pre-wrap [&>pre]:wrap-break-word [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: Required for Shiki HTML output
							dangerouslySetInnerHTML={{ __html: darkHtml }}
						/>
					</>
				) : (
					<pre className="m-0 whitespace-pre-wrap wrap-break-word bg-background p-4 text-foreground text-sm">
						<code className="font-mono text-sm">{code}</code>
					</pre>
				)}
				{children && (
					<div className="absolute top-2 right-2 flex items-center gap-2">
						{children}
					</div>
				)}
			</div>
		</div>
	);
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
	code: string;
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

/**
 * Button for copying code to clipboard.
 */
export const CodeBlockCopyButton = ({
	code,
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: CodeBlockCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);

	const copyToClipboard = async () => {
		if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
			onError?.(new Error("Clipboard API not available"));
			return;
		}

		try {
			await navigator.clipboard.writeText(code);
			setIsCopied(true);
			onCopy?.();
			setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	};

	const Icon = isCopied ? CheckIcon : CopyIcon;

	return (
		<Button
			className={cn("shrink-0", className)}
			onClick={copyToClipboard}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? <Icon size={14} />}
		</Button>
	);
};

/**
 * Wrapper component that detects system theme preference and applies it.
 */
export const SystemThemeWrapper = ({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) => {
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		setIsDark(mediaQuery.matches);

		const handleChange = (e: MediaQueryListEvent) => {
			setIsDark(e.matches);
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	return (
		<div className={cn(isDark && "dark", className)} {...props}>
			{children}
		</div>
	);
};
