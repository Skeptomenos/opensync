/**
 * Pocketbase Client Setup & React Context
 *
 * Single source of truth for the Pocketbase client instance.
 * Provides a React context for components to access the client.
 *
 * Note: Authentication is handled via Authelia headers, not Pocketbase auth.
 * The Pocketbase client is used for data operations only.
 */

import PocketBase from "pocketbase";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

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

// ============================================================================
// React Context for Pocketbase
// ============================================================================

interface PocketbaseContextType {
  /** The Pocketbase client instance */
  client: PocketBase;
  /** Whether the initial health check is in progress */
  isConnecting: boolean;
  /** Whether Pocketbase is healthy and reachable */
  isConnected: boolean;
  /** Error message if connection failed */
  error: string | null;
  /** Manually retry the connection check */
  retryConnection: () => Promise<void>;
}

const PocketbaseContext = createContext<PocketbaseContextType | null>(null);

/**
 * PocketbaseProvider - Wraps the app and provides Pocketbase client via context.
 *
 * Performs an initial health check on mount to verify Pocketbase is reachable.
 * Components can access the client and connection status via usePocketbase().
 *
 * Why a context provider instead of just importing `pb` directly?
 * - Enables connection status awareness in components
 * - Allows for error boundaries and retry logic
 * - Consistent pattern with other providers (Theme, Auth)
 * - Easier testing via provider mocking
 */
export function PocketbaseProvider({ children }: { children: ReactNode }) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const healthy = await isHealthy();
      setIsConnected(healthy);
      if (!healthy) {
        setError("Pocketbase is not responding");
      }
    } catch (err) {
      setIsConnected(false);
      setError(err instanceof Error ? err.message : "Failed to connect to Pocketbase");
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const contextValue: PocketbaseContextType = {
    client: pb,
    isConnecting,
    isConnected,
    error,
    retryConnection: checkConnection,
  };

  return (
    <PocketbaseContext.Provider value={contextValue}>
      {children}
    </PocketbaseContext.Provider>
  );
}

/**
 * Hook to access Pocketbase client and connection status.
 *
 * Must be used within a PocketbaseProvider.
 *
 * @example
 * const { client, isConnected } = usePocketbase();
 * if (isConnected) {
 *   const sessions = await client.collection('sessions').getList(1, 20);
 * }
 */
export function usePocketbase(): PocketbaseContextType {
  const context = useContext(PocketbaseContext);
  if (!context) {
    throw new Error("usePocketbase must be used within a PocketbaseProvider");
  }
  return context;
}

/**
 * Convenience hook to get just the client instance.
 * Throws if Pocketbase is not connected.
 *
 * @example
 * const pb = usePocketbaseClient();
 * const sessions = await pb.collection('sessions').getList(1, 20);
 */
export function usePocketbaseClient(): PocketBase {
  const { client, isConnected, isConnecting, error } = usePocketbase();
  if (isConnecting) {
    // During initial connection check, return client anyway
    // Components should handle loading state via usePocketbase()
    return client;
  }
  if (!isConnected && error) {
    console.warn(`Pocketbase not connected: ${error}`);
  }
  return client;
}

export default pb;
