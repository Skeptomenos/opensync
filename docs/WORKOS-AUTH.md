# WorkOS AuthKit Integration

OpenSync uses WorkOS AuthKit for authentication. This document explains the architecture, setup, and how authentication flows through the application.

## Overview

WorkOS AuthKit provides enterprise-grade authentication with support for SSO, MFA, and social login providers. In OpenSync, it handles:

1. User sign-in and sign-out
2. JWT token generation and validation
3. Session management
4. Identity verification for Convex backend calls

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
├─────────────────────────────────────────────────────────────────┤
│  AuthKitProvider (from @workos-inc/authkit-react)               │
│       │                                                          │
│       ▼                                                          │
│  ConvexProviderWithAuthKit (from @convex-dev/workos)            │
│       │                                                          │
│       ├──► useAuth() hook provides: user, signIn, signOut       │
│       │                                                          │
│       └──► Convex queries/mutations get authenticated context   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ JWT Token
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Convex Backend                           │
├─────────────────────────────────────────────────────────────────┤
│  auth.config.ts validates JWT using WorkOS JWKS endpoint        │
│       │                                                          │
│       ▼                                                          │
│  ctx.auth.getUserIdentity() returns verified user identity      │
│       │                                                          │
│       ▼                                                          │
│  Users table stores workosId linking to WorkOS identity         │
└─────────────────────────────────────────────────────────────────┘
```

## Environment Variables

### Frontend (Vite)

```bash
VITE_WORKOS_CLIENT_ID=client_XXXXXXXXXX
VITE_CONVEX_URL=https://your-project.convex.cloud
VITE_REDIRECT_URI=http://localhost:5173/callback  # Optional, defaults to origin/callback
```

### Backend (Convex)

```bash
WORKOS_CLIENT_ID=client_XXXXXXXXXX
```

Set the Convex environment variable using:

```bash
npx convex env set WORKOS_CLIENT_ID client_XXXXXXXXXX
```

## File Structure

```
src/
├── main.tsx           # Provider setup (AuthKitProvider + ConvexProviderWithAuthKit)
├── lib/
│   └── auth.tsx       # useAuth hook wrapper for components
└── pages/
    └── Login.tsx      # Login page with signIn trigger

convex/
├── auth.config.ts     # JWT validation configuration
├── users.ts           # User queries/mutations with identity checks
├── sessions.ts        # Data queries with ownership verification
└── http.ts            # HTTP endpoints with JWT/API key auth
```

## How It Works

### 1. Provider Setup (main.tsx)

The app wraps components with two providers:

```tsx
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexProviderWithAuthKit } from "@convex-dev/workos";

function Root() {
  return (
    <AuthKitProvider
      clientId={import.meta.env.VITE_WORKOS_CLIENT_ID}
      redirectUri={`${window.location.origin}/callback`}
    >
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        {/* App components */}
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  );
}
```

The `ConvexProviderWithAuthKit` passes the WorkOS JWT token to Convex automatically.

### 2. Auth Hook (lib/auth.tsx)

Components use a custom `useAuth` hook that wraps AuthKit:

```tsx
import { useAuth as useAuthKit } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";

export function useAuth() {
  const { user, signIn, signOut, isLoading: authKitLoading } = useAuthKit();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();

  return {
    user: user ? { id: user.id, email: user.email, ... } : null,
    isLoading: authKitLoading || convexLoading,
    isAuthenticated,
    signIn: () => signIn(),
    signOut: () => signOut(),
  };
}
```

### 3. JWT Validation (convex/auth.config.ts)

Convex validates incoming JWTs using WorkOS JWKS:

```ts
const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
```

Two providers are configured to handle both SSO tokens and User Management tokens from WorkOS.

### 4. Backend Identity Verification

Every Convex query and mutation verifies the user identity:

```ts
export const list = query({
  handler: async (ctx) => {
    // Get verified identity from JWT
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { sessions: [], hasMore: false };

    // Find user by WorkOS ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .first();

    if (!user) return { sessions: [], hasMore: false };

    // Query only this user's data
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return { sessions };
  },
});
```

### 5. HTTP Endpoint Authentication

HTTP endpoints support both JWT and API key authentication:

```ts
async function authenticate(ctx: any, request: Request) {
  const authHeader = request.headers.get("Authorization");
  
  // API key auth (Bearer osk_...)
  if (authHeader?.startsWith("Bearer osk_")) {
    return validateApiKey(ctx, request);
  }
  
  // JWT auth (Bearer eyJ...)
  return validateJWT(ctx, request);
}
```

## Authentication Flow

### Sign In

1. User clicks "Sign in" button
2. `signIn()` from AuthKit redirects to WorkOS hosted login
3. User authenticates (email, Google, SSO, etc.)
4. WorkOS redirects back to `/callback` with tokens
5. AuthKit exchanges tokens and stores session
6. `ConvexProviderWithAuthKit` passes JWT to Convex
7. `getOrCreate` mutation creates or updates user in database

### Sign Out

1. User clicks sign out
2. `signOut()` clears AuthKit session
3. User is redirected to login page

### API Access

1. User generates API key in settings
2. External apps use `Authorization: Bearer osk_...` header
3. HTTP endpoint validates key against database
4. Queries filter data by user ID

## Data Isolation

Every user's data is isolated through these mechanisms:

| Layer | Mechanism |
|-------|-----------|
| Schema | `sessions.userId` links data to owner |
| Indexes | `by_user`, `by_user_updated` enable efficient filtering |
| Queries | All queries filter by authenticated user's ID |
| Mutations | Ownership verified before updates/deletes |
| Search | Vector and text search filter by `userId` |

## WorkOS Dashboard Setup

1. Create a WorkOS account at workos.com
2. Create a new project
3. Enable User Management
4. Configure redirect URIs:
   - Development: `http://localhost:5173/callback`
   - Production: `https://yourdomain.com/callback`
5. Copy the Client ID to environment variables
6. (Optional) Configure SSO connections, social providers, MFA

## Troubleshooting

### Token validation fails

1. Verify `WORKOS_CLIENT_ID` matches in frontend and backend
2. Check Convex environment variables: `npx convex env list`
3. Ensure redirect URI matches exactly in WorkOS dashboard

### User not found after login

1. Check if `getOrCreate` mutation runs after sign-in
2. Verify the `by_workos_id` index exists in schema
3. Check Convex logs for errors

### CORS errors on HTTP endpoints

The HTTP router includes CORS headers for all responses:

```ts
headers: {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
}
```

## Security Considerations

1. JWTs are validated using RS256 algorithm with WorkOS public keys
2. API keys are stored hashed and never logged
3. All queries enforce user ownership before returning data
4. Public session sharing requires explicit `isPublic` flag
5. `userId` is stripped from public session responses

## Related Documentation

- WorkOS AuthKit: https://workos.com/docs/authkit
- Convex WorkOS Integration: https://docs.convex.dev/auth/authkit/
- Convex Auth Functions: https://docs.convex.dev/auth/functions-auth
