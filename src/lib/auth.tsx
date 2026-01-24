// Authelia-based authentication
// Reads user info from headers passed by Traefik/Authelia
// Syncs authenticated users to Pocketbase for data persistence

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type User, type PocketbaseUser, toUser } from "./types";
import { syncUser } from "./userSync";

// Re-export User type for consumers that import from auth.tsx
export type { User } from "./types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  signIn: () => {},
  signOut: () => {},
});

export function AutheliaAuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    signIn: () => {},
    signOut: () => {},
  });

  useEffect(() => {
    async function checkAuth() {
      try {
        // Fetch user info from /api/me endpoint that returns Authelia headers
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          if (data.email) {
            // Sync user to Pocketbase - creates or updates user record
            // This ensures the user exists in PB with a proper ID for data relations
            let pbUser: PocketbaseUser | null = null;
            try {
              const syncResult = await syncUser({
                email: data.email,
                name: data.name,
                groups: data.groups,
              });
              pbUser = syncResult.user;
              if (syncResult.created) {
                console.log("[auth] Created new Pocketbase user:", pbUser.email);
              }
            } catch (syncError) {
              // Log but don't fail auth - user can still use app with limited functionality
              console.error("[auth] Failed to sync user to Pocketbase:", syncError);
            }

            // Use toUser to create UI-compatible user object
            // If we have a PB user, use that (includes id, apiKey, etc.)
            // Otherwise fall back to auth context only
            const user = pbUser
              ? toUser(pbUser)
              : toUser({
                  email: data.email,
                  name: data.name,
                  groups: data.groups,
                });

            // Merge groups from Authelia headers (not stored in PB)
            if (data.groups) {
              user.groups = data.groups;
            }

            setAuthState({
              user,
              isLoading: false,
              isAuthenticated: true,
              signIn: () => {
                // Authelia handles sign-in via redirect, just reload
                window.location.reload();
              },
              signOut: () => {
                // Redirect to Authelia logout
                window.location.href = "https://auth.example.com/logout";
              },
            });
            return;
          }
        }
        // Not authenticated - but if behind Authelia, this shouldn't happen
        setAuthState(prev => ({
          ...prev,
          user: null,
          isLoading: false,
          isAuthenticated: false,
        }));
      } catch (error) {
        console.error("Auth check failed:", error);
        setAuthState(prev => ({
          ...prev,
          user: null,
          isLoading: false,
          isAuthenticated: false,
        }));
      }
    }
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

// Compatibility export for useAuthState (used by some components)
export function useAuthState() {
  const { isLoading, isAuthenticated } = useAuth();
  return { isLoading, isAuthenticated };
}
