/**
 * Head manager for updating document head during navigation
 * Updates title, meta tags, canonical URL, and Open Graph tags
 */

import type { HeadData } from "~/framework/shared/navigation-payload";

/**
 * Get or create a meta tag by name or property
 */
const getOrCreateMetaTag = (
  attribute: "name" | "property",
  value: string
): HTMLMetaElement => {
  const selector = `meta[${attribute}="${value}"]`;
  let meta = document.querySelector<HTMLMetaElement>(selector);

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, value);
    document.head.appendChild(meta);
  }

  return meta;
};

/**
 * Remove all Open Graph meta tags
 */
const removeOpenGraphTags = (): void => {
  const ogTags = document.querySelectorAll('meta[property^="og:"]');
  for (const tag of Array.from(ogTags)) {
    tag.remove();
  }
};

/**
 * Update document head with new metadata
 *
 * @param head - Head data to apply
 */
export const updateHead = (head: HeadData): void => {
  if (typeof document === "undefined") {
    return;
  }

  // Update title
  if (head.title !== undefined) {
    document.title = head.title;
  }

  // Update description meta tag
  if (head.description !== undefined) {
    const metaDescription = getOrCreateMetaTag("name", "description");
    metaDescription.content = head.description;
  }

  // Update canonical URL
  if (head.canonical !== undefined) {
    let canonicalLink = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = head.canonical;
  }

  // Update Open Graph tags
  if (head.openGraph) {
    // Remove existing OG tags first
    removeOpenGraphTags();

    // Add new OG tags
    for (const [key, value] of Object.entries(head.openGraph)) {
      const ogKey = key.startsWith("og:") ? key : `og:${key}`;
      const ogMeta = getOrCreateMetaTag("property", ogKey);
      ogMeta.content = value;
    }
  }
};
