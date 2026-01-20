import { useState, useEffect, type ReactNode } from "react";
import { Routes, Route, Navigate, Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useAuth as useAuthKit } from "@workos-inc/authkit-react";
import { ThemeProvider } from "./lib/theme";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { DocsPage } from "./pages/Docs";
import { PublicSessionPage } from "./pages/PublicSession";
import { SettingsPage } from "./pages/Settings";
import { EvalsPage } from "./pages/Evals";
import { ContextPage } from "./pages/Context";
import { Loader2, ArrowLeft } from "lucide-react";

// Storage key for preserving intended route across auth flow
const RETURN_TO_KEY = "opensync_return_to";

// Dedicated callback handler that waits for AuthKit to finish processing
// before redirecting to the intended route
function CallbackHandler() {
  const { isLoading: workosLoading, user } = useAuthKit();
  const { isLoading, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const [processingTimeout, setProcessingTimeout] = useState(false);

  // Check if we have an authorization code in the URL
  const hasCode = searchParams.has("code");

  // Timeout after 10 seconds to prevent infinite loading
  useEffect(() => {
    if (hasCode) {
      const timer = setTimeout(() => setProcessingTimeout(true), 10000);
      return () => clearTimeout(timer);
    }
  }, [hasCode]);

  // If we have a code and are still loading, show processing state
  if (hasCode && (workosLoading || isLoading) && !processingTimeout) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500 mx-auto" />
          <p className="mt-2 text-xs text-zinc-600">Completing sign in...</p>
        </div>
      </div>
    );
  }

  // If processing timed out, redirect to login
  if (processingTimeout && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated, redirect to saved route or home
  if (isAuthenticated || user) {
    const returnTo = sessionStorage.getItem(RETURN_TO_KEY) || "/";
    sessionStorage.removeItem(RETURN_TO_KEY);
    return <Navigate to={returnTo} replace />;
  }

  // No code and not authenticated, show login
  return <LoginPage />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const [syncTimeout, setSyncTimeout] = useState(false);

  // Save the intended route before redirecting to login
  // This allows returning to the original page after authentication
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !user) {
      const currentPath = location.pathname + location.search;
      // Only save if not already on login/callback routes
      if (currentPath !== "/login" && currentPath !== "/callback") {
        sessionStorage.setItem(RETURN_TO_KEY, currentPath);
      }
    }
  }, [isLoading, isAuthenticated, user, location]);

  // Timeout for sync loading state (5 seconds max)
  useEffect(() => {
    if (user && !isAuthenticated && !isLoading) {
      const timer = setTimeout(() => setSyncTimeout(true), 5000);
      return () => clearTimeout(timer);
    }
    setSyncTimeout(false);
  }, [user, isAuthenticated, isLoading]);

  // Show loading while auth state is being determined
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500 mx-auto" />
          <p className="mt-2 text-xs text-zinc-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If we have a WorkOS user but Convex isn't authenticated yet, show syncing
  // But if sync times out, redirect to login (session may have expired)
  if (user && !isAuthenticated) {
    if (syncTimeout) {
      // Session sync failed - redirect to login
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500 mx-auto" />
          <p className="mt-2 text-xs text-zinc-600">Syncing session...</p>
        </div>
      </div>
    );
  }

  // Not authenticated and no user - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// 404 page for unmatched routes
function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
      <div className="text-center">
        <pre className="text-xs mb-4 text-zinc-600 whitespace-pre">
{`
 _  _    ___  _  _   
| || |  / _ \\| || |  
| || |_| | | | || |_ 
|__   _| | | |__   _|
   | | | |_| |  | |  
   |_|  \\___/   |_|  
`}
        </pre>
        <p className="text-zinc-400 mb-2">Page not found</p>
        <p className="text-sm text-zinc-600 mb-6">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/callback" element={<CallbackHandler />} />
      <Route path="/s/:slug" element={<PublicSessionPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      {/* Profile redirects to settings (profile tab is in settings) */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/evals"
        element={
          <ProtectedRoute>
            <EvalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/context"
        element={
          <ProtectedRoute>
            <ContextPage />
          </ProtectedRoute>
        }
      />
      {/* Dashboard routes - both / and /dashboard show the same page */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      {/* Catch-all 404 route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </ThemeProvider>
  );
}
