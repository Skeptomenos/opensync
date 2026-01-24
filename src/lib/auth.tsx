// Authelia-based authentication
// Reads user info from headers passed by Traefik/Authelia

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type User, toUser } from "./types";

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
            // Use toUser to derive firstName/lastName from name for UI compatibility
            const user = toUser({
              email: data.email,
              name: data.name,
              groups: data.groups,
            });
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
