import { type ReactNode } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { DashboardPage } from "./pages/Dashboard";
import { DocsPage } from "./pages/Docs";
import { PublicSessionPage } from "./pages/PublicSession";
import { SettingsPage } from "./pages/Settings";
import { EvalsPage } from "./pages/Evals";
import { ContextPage } from "./pages/Context";
import { Loader2, ArrowLeft } from "lucide-react";

// ProtectedRoute - checks Authelia auth state
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  // Still loading auth state
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

  // Not authenticated - this shouldn't happen behind Authelia,
  // but handle it gracefully
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-2">Authentication required</p>
          <p className="text-sm text-zinc-600 mb-4">
            Please sign in via Authelia to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
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
        {/* Public routes */}
        <Route path="/s/:slug" element={<PublicSessionPage />} />
        <Route path="/docs" element={<DocsPage />} />

        {/* Protected routes */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
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
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Root redirects to dashboard (Authelia handles auth) */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* Catch-all 404 route */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ThemeProvider>
  );
}
