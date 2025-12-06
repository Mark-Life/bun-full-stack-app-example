/**
 * Hash generation utility for navigation payloads
 * Uses SHA-256 with build-time salt for security
 */

import { createHash } from "node:crypto";

/**
 * Build salt for hash generation
 * Generated at startup or from environment variable
 */
let buildSalt: string | null = null;

/**
 * Initialize build salt (called at server startup)
 * Uses BUILD_SALT env var or generates a random salt
 */
export const initializeBuildSalt = (): void => {
  if (buildSalt) {
    return;
  }

  buildSalt = process.env["BUILD_SALT"] || generateRandomSalt();
};

/**
 * Generate a random salt for hash generation
 */
const generateRandomSalt = (): string => {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Get the current build salt (initializes if not set)
 */
const getBuildSalt = (): string => {
  if (!buildSalt) {
    initializeBuildSalt();
  }
  return buildSalt || "";
};

/**
 * Generate SHA-256 hash for navigation payload
 * Includes build salt to prevent tampering
 *
 * @param payload - Navigation payload to hash (without hash field)
 * @returns Hex-encoded hash string
 */
export const generatePayloadHash = (payload: {
  data: unknown;
  route: {
    path: string;
    pageType: "static" | "dynamic";
    hasClientComponents: boolean;
    params: Record<string, string>;
  };
  chunks: string[];
  head: {
    title?: string;
    description?: string;
    canonical?: string;
    openGraph?: Record<string, string>;
  };
  redirect?: string;
  notFound?: boolean;
}): string => {
  const salt = getBuildSalt();
  const payloadString = JSON.stringify(payload);
  const hash = createHash("sha256");
  hash.update(salt);
  hash.update(payloadString);
  return hash.digest("hex");
};
