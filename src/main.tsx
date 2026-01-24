import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PocketbaseProvider } from "./lib/pocketbase";
import { AutheliaAuthProvider } from "./lib/auth";
import App from "./App";
import "./index.css";

/**
 * Root component wrapping the app with all providers.
 *
 * Provider order (outermost to innermost):
 * 1. PocketbaseProvider - Establishes connection to Pocketbase backend
 * 2. AutheliaAuthProvider - Syncs Authelia headers to Pocketbase user
 * 3. BrowserRouter - Client-side routing
 * 4. App - Main application component
 *
 * Why this order?
 * - PocketbaseProvider must be outermost so auth can use the PB client
 * - AutheliaAuthProvider depends on PocketbaseProvider to sync user
 * - BrowserRouter provides routing context to App
 */
function Root() {
  return (
    <PocketbaseProvider>
      <AutheliaAuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AutheliaAuthProvider>
    </PocketbaseProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
