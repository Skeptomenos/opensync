// Login page - with Authelia, this just redirects to dashboard
// Authelia handles authentication at the Traefik level

import { Navigate } from "react-router-dom";

export function LoginPage() {
  // Authelia handles auth at the reverse proxy level
  // If user reaches this page, they should go to dashboard
  return <Navigate to="/dashboard" replace />;
}
