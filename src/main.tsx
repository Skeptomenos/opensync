import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import { AutheliaAuthProvider } from "./lib/auth";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function Root() {
  return (
    <ConvexProvider client={convex}>
      <AutheliaAuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AutheliaAuthProvider>
    </ConvexProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
