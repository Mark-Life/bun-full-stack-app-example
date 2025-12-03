/**
 * JSX Serialization Utilities for RSC Payload
 * Converts React elements to/from a JSON-serializable format
 */

import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";

/**
 * Serialized node types
 */
export type SerializedNode =
  | SerializedElement
  | SerializedText
  | SerializedNull
  | SerializedArray;

export interface SerializedElement {
  __type: "element";
  /** Component name or HTML tag */
  tag: string;
  /** Component props (excluding children) */
  props: Record<string, unknown>;
  /** Serialized children */
  children: SerializedNode[];
}

export interface SerializedText {
  __type: "text";
  value: string | number;
}

export interface SerializedNull {
  __type: "null";
}

export interface SerializedArray {
  __type: "array";
  items: SerializedNode[];
}

/**
 * Registry of component references for deserialization
 * Maps component names to actual component functions
 */
const componentRegistry = new Map<string, React.ComponentType<unknown>>();

/**
 * Register a component for deserialization
 */
export const registerComponent = (
  name: string,
  component: React.ComponentType<unknown>
): void => {
  componentRegistry.set(name, component);
};

/**
 * Get component name for serialization
 */
const getComponentName = (type: unknown): string => {
  if (typeof type === "string") {
    return type; // HTML tag
  }
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || "Anonymous";
  }
  if (typeof type === "object" && type !== null) {
    // React.Fragment, React.Suspense, etc.
    const typeObj = type as { $$typeof?: symbol; displayName?: string };
    if (typeObj.displayName) {
      return typeObj.displayName;
    }
    // Check for Symbol types
    const symbolString = String(typeObj.$$typeof || type);
    if (symbolString.includes("fragment")) {
      return "Fragment";
    }
    if (symbolString.includes("suspense")) {
      return "Suspense";
    }
  }
  return "Unknown";
};

/**
 * Check if a prop value is serializable
 */
const isSerializable = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return true;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isSerializable);
  }
  if (typeof value === "object") {
    // Check if it's a plain object
    const proto = Object.getPrototypeOf(value);
    if (proto === null || proto === Object.prototype) {
      return Object.values(value as Record<string, unknown>).every(
        isSerializable
      );
    }
  }
  return false;
};

/**
 * Serialize props, filtering out non-serializable values
 */
const serializeProps = (
  props: Record<string, unknown>
): Record<string, unknown> => {
  const serialized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    // Skip children (handled separately) and functions
    if (key === "children") {
      continue;
    }
    if (typeof value === "function") {
      continue;
    }

    // Only include serializable values
    if (isSerializable(value)) {
      serialized[key] = value;
    }
  }

  return serialized;
};

/**
 * Serialize a React node to JSON-serializable format
 */
export const serializeJSX = (node: ReactNode): SerializedNode => {
  // Handle null/undefined
  if (node === null || node === undefined) {
    return { __type: "null" };
  }

  // Handle primitives (string, number)
  if (typeof node === "string" || typeof node === "number") {
    return { __type: "text", value: node };
  }

  // Handle boolean (renders nothing)
  if (typeof node === "boolean") {
    return { __type: "null" };
  }

  // Handle arrays
  if (Array.isArray(node)) {
    return {
      __type: "array",
      items: node.map(serializeJSX),
    };
  }

  // Handle React elements
  if (isValidElement(node)) {
    const element = node as ReactElement<Record<string, unknown>>;
    const tag = getComponentName(element.type);
    const props = serializeProps(element.props || {});

    // Serialize children
    const children: SerializedNode[] = [];
    Children.forEach(element.props["children"], (child) => {
      children.push(serializeJSX(child as ReactNode));
    });

    return {
      __type: "element",
      tag,
      props,
      children,
    };
  }

  // Fallback for unknown types
  return { __type: "null" };
};

/**
 * Deserialize a serialized node back to React elements
 * Note: This creates static React elements - event handlers won't work
 */
export const deserializeJSX = (
  node: SerializedNode,
  createElement: typeof import("react").createElement
): ReactNode => {
  if (node.__type === "null") {
    return null;
  }

  if (node.__type === "text") {
    return node.value;
  }

  if (node.__type === "array") {
    return node.items.map((item, idx) => {
      const deserialized = deserializeJSX(item, createElement);
      // Add key if it's an element
      if (isValidElement(deserialized)) {
        const props = deserialized.props as Record<string, unknown>;
        return createElement(
          deserialized.type,
          { ...props, key: props["key"] ?? idx },
          props["children"] as ReactNode
        );
      }
      return deserialized;
    });
  }

  if (node.__type === "element") {
    // Look up component in registry, fall back to HTML tag
    const Component = componentRegistry.get(node.tag) || node.tag;

    // Deserialize children
    const children = node.children.map((child) => {
      const deserialized = deserializeJSX(child, createElement);
      return deserialized;
    });

    // Create element
    return createElement(
      Component as string | React.ComponentType,
      node.props,
      ...children
    );
  }

  return null;
};

/**
 * RSC Payload structure
 */
export interface RSCPayload {
  /** Map of component ID to serialized output */
  components: Record<string, SerializedNode>;
  /** Timestamp when payload was generated */
  generatedAt: number;
}

/**
 * Serialize RSC payload to JSON string
 */
export const serializePayload = (payload: RSCPayload): string =>
  JSON.stringify(payload);

/**
 * Parse RSC payload from JSON string
 */
export const parsePayload = (json: string): RSCPayload | null => {
  try {
    return JSON.parse(json) as RSCPayload;
  } catch {
    return null;
  }
};

/**
 * Generate a unique component ID from component name and props
 */
export const generateComponentId = (
  componentName: string,
  props: Record<string, unknown>
): string => {
  // Simple hash based on component name and serializable props
  const propsString = JSON.stringify(serializeProps(props));
  let hash = 0;
  const str = `${componentName}:${propsString}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    // biome-ignore lint/suspicious/noBitwiseOperators: bitwise operations for hash
    hash = (hash * 31 + char) | 0; // Simple hash with 32-bit overflow
  }
  return `${componentName}_${Math.abs(hash).toString(36)}`;
};
