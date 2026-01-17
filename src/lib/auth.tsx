// Auth wrapper that uses WorkOS AuthKit
// This provides a consistent interface for components while using AuthKit under the hood

import { useAuth as useAuthKit } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
}

// Main auth hook that wraps AuthKit
export function useAuth(): AuthState {
  const { user, signIn, signOut, isLoading: authKitLoading } = useAuthKit();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();

  // Map WorkOS user to our User interface
  const mappedUser: User | null = user
    ? {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        profilePictureUrl: user.profilePictureUrl ?? undefined,
      }
    : null;

  return {
    user: mappedUser,
    isLoading: authKitLoading || convexLoading,
    isAuthenticated,
    signIn: () => signIn(),
    signOut: () => signOut(),
  };
}

// Compatibility export for useAuthState
export function useAuthState() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return { isLoading, isAuthenticated };
}
