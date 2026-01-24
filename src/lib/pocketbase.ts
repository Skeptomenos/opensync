/**
 * Pocketbase Client Setup
 *
 * Single source of truth for the Pocketbase client instance.
 * Used throughout the app to interact with the Pocketbase backend.
 *
 * Note: Authentication is handled via Authelia headers, not Pocketbase auth.
 * The Pocketbase client is used for data operations only.
 */

import PocketBase from "pocketbase";

// Get Pocketbase URL from environment.
// In development, Vite proxies /api/* to Pocketbase, so we use relative URLs.
// In production (behind Traefik), both app and Pocketbase are on the same origin.
const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || "";

/**
 * Singleton Pocketbase client instance.
 *
 * Uses relative URL ("") so requests go through Vite proxy in dev
 * and same-origin in production. This avoids CORS issues.
 */
export const pb = new PocketBase(POCKETBASE_URL);

// Disable auto-cancellation for concurrent requests.
// This allows multiple hooks to fetch data simultaneously without cancelling each other.
pb.autoCancellation(false);

/**
 * Health check to verify Pocketbase is reachable.
 * @returns Promise resolving to health status or throwing on failure
 */
export async function checkHealth(): Promise<{ code: number; message: string }> {
  const response = await pb.send("/api/health", { method: "GET" });
  return response;
}

/**
 * Helper to check if Pocketbase is connected.
 * @returns Promise<boolean> - true if healthy, false otherwise
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const health = await checkHealth();
    return health.code === 200;
  } catch {
    return false;
  }
}

export default pb;
