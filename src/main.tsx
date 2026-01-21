import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

// Handle redirect after OAuth callback
// This is called by AuthKit after the authorization code exchange completes
// We just clean the URL here - the actual navigation is handled by CallbackHandler
const onRedirectCallback = () => {
  // Just clean the URL params without navigating
  // The CallbackHandler component handles the actual redirect
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
};

function Root() {
  return (
    <AuthKitProvider
      clientId={import.meta.env.VITE_WORKOS_CLIENT_ID}
      redirectUri={import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/callback`}
      devMode={true}  // Force localStorage tokens to avoid third-party cookie blocking in production
      onRedirectCallback={onRedirectCallback}
    >
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
