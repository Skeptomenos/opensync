import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PocketbaseProvider } from "./lib/pocketbase";
import { AutheliaAuthProvider } from "./lib/auth";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

/**
 * Root component wrapping the app with all providers.
 *
 * Provider order (outermost to innermost):
 * 1. AppErrorBoundary - Catches unhandled errors and shows fallback UI
 * 2. PocketbaseProvider - Establishes connection to Pocketbase backend
 * 3. AutheliaAuthProvider - Syncs Authelia headers to Pocketbase user
 * 4. BrowserRouter - Client-side routing
 * 5. App - Main application component
 *
 * Why this order?
 * - AppErrorBoundary must be outermost to catch errors from all providers
 * - PocketbaseProvider must be early so auth can use the PB client
 * - AutheliaAuthProvider depends on PocketbaseProvider to sync user
 * - BrowserRouter provides routing context to App
 */
function Root() {
  return (
    <AppErrorBoundary>
      <PocketbaseProvider showConnectionError>
        <AutheliaAuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AutheliaAuthProvider>
      </PocketbaseProvider>
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
