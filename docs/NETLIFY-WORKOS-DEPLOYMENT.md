# Netlify and WorkOS Deployment Guide

This document covers deployment issues encountered and fixes applied to get OpenSync running on Netlify with WorkOS AuthKit and Convex.

Built with Cursor and Claude Opus 4.5.

## Summary for WorkOS team

This app combines WorkOS AuthKit, Convex (real-time backend), and Netlify (static hosting). Setting up authentication across these three platforms revealed several pain points that could be improved.

**What worked well:**
- AuthKit React SDK is clean and straightforward
- Hosted login page removes complexity from the app
- JWT-based auth integrates well with Convex custom JWT providers
- Enterprise features (SSO, MFA) available without extra code

**What caused friction:**
- CORS configuration buried in dashboard, not mentioned in React quickstart
- Two JWT issuers required (SSO + User Management) with undocumented format
- Session persistence in production requires `devMode: false` but this breaks some refresh scenarios
- Callback handling needed custom component with timeout logic
- No clear guidance for Convex integration despite official `@convex-dev/workos` package

**Suggestions below are organized by platform.**

---

## Suggestions for WorkOS team

### Documentation improvements

1. **Add CORS setup to React quickstart**
   - The [AuthKit React docs](https://workos.com/docs/authkit/react) don't mention CORS
   - Users hit silent failures when the token exchange is blocked
   - Add a step: "Go to Authentication > Sessions > CORS and add your domain"

2. **Document both JWT issuers for custom JWT validation**
   - Apps validating tokens server-side need both issuers configured
   - Current docs only show the SSO issuer format
   - Add example showing both `https://api.workos.com/` and `https://api.workos.com/user_management/{clientId}`

3. **Create a Convex integration guide**
   - The `@convex-dev/workos` package exists but has minimal docs
   - Users have to piece together auth.config.ts format from forum posts
   - A dedicated guide would help the Convex + WorkOS overlap

4. **Clarify devMode behavior in production**
   - The `devMode` prop on AuthKitProvider affects session persistence
   - When `devMode: false`, users sometimes have to re-authenticate on refresh
   - Document the expected behavior and recommended production settings

### Dashboard UX improvements

1. **Surface CORS configuration more prominently**
   - Currently hidden under Authentication > Sessions > CORS
   - Could be shown during redirect URI setup since they're related

2. **Add redirect URI validation**
   - The dashboard accepts any URI without validation
   - A warning when the URI doesn't match common patterns (missing /callback, http vs https) would catch typos

3. **Show example JWT payload in dashboard**
   - Debugging auth often requires decoding tokens to check issuer/audience
   - A "View example token" button in the dashboard would speed up debugging

### SDK improvements

1. **Add callback status callback to AuthKitProvider**
   - We built a custom CallbackHandler with timeout logic
   - A built-in `onCallbackComplete` or `onCallbackError` prop would help apps show loading states

2. **Expose token refresh status**
   - Hard to tell when a token refresh is in progress vs failed
   - An `isRefreshing` state in useAuth would help

---

## Suggestions for Convex team

### Documentation improvements

1. **Add WorkOS auth.config.ts example to official docs**
   - The [Convex AuthKit docs](https://docs.convex.dev/auth/authkit/) show a basic example
   - Missing: the two-issuer configuration needed for User Management tokens
   - Add complete auth.config.ts with both providers

2. **Document environment variable deployment flow**
   - Changes to Convex env vars require `npx convex deploy`
   - This isn't obvious and causes "auth works locally but not in prod" confusion

3. **Add troubleshooting section for JWT validation**
   - Common issues: wrong issuer, missing JWKS URL, client ID mismatch
   - A checklist in docs would reduce support burden

### Developer experience

1. **Better error messages for auth config**
   - When JWT validation fails, the error is generic
   - Including the expected vs actual issuer would help debugging

2. **Add `convex env sync` or auto-deploy on env change**
   - Currently requires manual `npx convex deploy` after adding env vars
   - Could sync automatically or prompt the user

---

## Suggestions for Netlify team

### Documentation improvements

1. **Add SPA routing to Vite template**
   - The default Vite starter doesn't include `_redirects`
   - First-time deployers hit 404s on direct navigation
   - Include `public/_redirects` with `/* /index.html 200` in Vite template

2. **Surface environment variable requirements for VITE_**
   - The `VITE_` prefix requirement isn't obvious
   - A warning when vars don't have the prefix would help

---

## Suggestions for Cursor/AI coding tools

### Context improvements

1. **Include deployment config in project context**
   - AI agents don't know about Netlify SPA routing requirements
   - Including common deployment patterns in context would prevent 404 issues

2. **Teach multi-platform environment variable flows**
   - OpenSync needed vars in three places: Netlify, Convex, WorkOS
   - AI agents could prompt users to verify each platform's config

---

## Issues encountered (chronological)

### January 2026 Week 1: Initial WorkOS integration

**Problem:** Custom OAuth implementation failed with CORS and client_secret errors.

**Root cause:** Attempted to call WorkOS token exchange API directly from frontend. This requires `client_secret` which must stay server-side.

**Fix:** Switched to official `@workos-inc/authkit-react` and `@convex-dev/workos` packages. AuthKit handles token exchange securely.

**Files changed:**
- `src/main.tsx` - Added AuthKitProvider and ConvexProviderWithAuthKit
- `src/lib/auth.tsx` - Simplified to wrap AuthKit hooks
- `convex/auth.config.ts` - Updated to customJwt format

### January 2026 Week 1: auth.config.ts format confusion

**Problem:** Convex JWT validation failed silently. Users could complete WorkOS login but `isAuthenticated` stayed false.

**Root cause:** Old auth.config.ts used `domain` field which is deprecated. New format requires `type: "customJwt"`, `issuer`, `algorithm`, and `jwks` fields.

**Fix:** Updated auth.config.ts with two JWT providers (SSO and User Management).

```typescript
// Before (broken)
export default {
  providers: [
    {
      domain: "https://api.workos.com/",
      applicationID: process.env.WORKOS_CLIENT_ID,
    },
  ],
};

// After (working)
const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer: "https://api.workos.com/",
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt" as const,
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
```

### January 2026 Week 2: Netlify 404 on all routes

**Problem:** Direct navigation to `/login`, `/docs`, `/settings` returned Netlify's default 404 page.

**Root cause:** Netlify serves static files. SPAs need all routes to serve `index.html` so React Router can handle client-side routing.

**Fix:** Added two files:

`public/_redirects`:
```
/*    /index.html   200
```

`netlify.toml`:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### January 2026 Week 2: TypeScript build errors on Netlify

**Problem:** Build failed with `Property 'env' does not exist on type 'ImportMeta'`.

**Root cause:** Vite uses `import.meta.env` for environment variables. TypeScript needs type declarations.

**Fix:** Created `src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_WORKOS_CLIENT_ID: string;
  readonly VITE_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

Also added `@types/node` to devDependencies and updated `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "node"]
  }
}
```

### January 2026 Week 2: Login completes but user not authenticated

**Problem:** User clicks sign in, completes WorkOS login, redirects back to app, but stays on login page.

**Root cause:** Multiple configuration issues:
1. Missing CORS configuration in WorkOS dashboard
2. Missing Convex environment variables
3. Redirect URI mismatch

**Fix:**

WorkOS dashboard (Authentication > Sessions > CORS):
```
https://opensyncsessions.netlify.app
```

Netlify environment variables:
```
VITE_CONVEX_URL=https://your-app.convex.cloud
VITE_WORKOS_CLIENT_ID=client_01XXXXX
```

Convex environment variables:
```
WORKOS_CLIENT_ID=client_01XXXXX
```

WorkOS redirect URIs:
```
Redirect URI: https://opensyncsessions.netlify.app/callback
Sign-out redirect: https://opensyncsessions.netlify.app
```

### January 2026 Week 3: Session not persisting on page refresh

**Problem:** Users had to sign in again every time they refreshed the page.

**Root cause:** The `devMode` prop on AuthKitProvider and callback handling flow issues.

**Fix:**
1. Added `devMode` configuration based on environment
2. Created dedicated CallbackHandler component with 10-second timeout
3. Added return-to URL preservation for post-login redirect

```tsx
// main.tsx
<AuthKitProvider
  clientId={import.meta.env.VITE_WORKOS_CLIENT_ID}
  redirectUri={`${window.location.origin}/callback`}
  devMode={import.meta.env.DEV}
>
```

### January 2026 Week 3: Callback race condition

**Problem:** Sometimes the callback page would redirect before authentication completed.

**Root cause:** WorkOS and Convex auth states load asynchronously. The app was checking `isAuthenticated` before both were ready.

**Fix:** Added CallbackHandler that waits for both auth providers:

```tsx
function CallbackHandler() {
  const { isLoading: authKitLoading } = useAuthKit();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  
  // Wait for both to complete with 10s timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      navigate("/login");
    }, 10000);
    
    if (!authKitLoading && !convexLoading && isAuthenticated) {
      clearTimeout(timeout);
      navigate(returnTo || "/");
    }
    
    return () => clearTimeout(timeout);
  }, [authKitLoading, convexLoading, isAuthenticated]);
}
```

---

## The stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | Convex (real-time database and functions) |
| Auth | WorkOS AuthKit |
| Hosting | Netlify |

## Configuration files

### netlify.toml

```toml
# Netlify configuration for OpenSync SPA

[build]
  publish = "dist"
  command = "npm run build"

# Headers for security and caching
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"

# Cache static assets
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# SPA fallback - must be last
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### public/_redirects

```
# SPA fallback - serve index.html for all routes so React Router handles navigation
/*    /index.html   200
```

### src/vite-env.d.ts

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_WORKOS_CLIENT_ID: string;
  readonly VITE_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### convex/auth.config.ts

```typescript
const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer: "https://api.workos.com/",
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt" as const,
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256" as const,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
```

## Environment variable checklist

### Netlify (build-time, client-side)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CONVEX_URL` | Yes | Convex deployment URL |
| `VITE_WORKOS_CLIENT_ID` | Yes | WorkOS client ID |
| `VITE_REDIRECT_URI` | No | OAuth callback URL (defaults to `origin/callback`) |
| `CONVEX_DEPLOY_KEY` | Yes | For `npx convex deploy` during build |

### Convex (server-side)

| Variable | Required | Description |
|----------|----------|-------------|
| `WORKOS_CLIENT_ID` | Yes | For JWT validation in auth.config.ts |
| `OPENAI_API_KEY` | Yes | For embeddings and semantic search |

### WorkOS dashboard

| Setting | Value |
|---------|-------|
| Redirect URI | `https://your-domain.netlify.app/callback` |
| CORS origins | `https://your-domain.netlify.app` |
| Sign-out redirect | `https://your-domain.netlify.app` |

## Deployment steps

1. **Set Netlify environment variables**
   - Site settings > Environment variables
   - Add `VITE_CONVEX_URL` and `VITE_WORKOS_CLIENT_ID`

2. **Set Convex environment variables**
   - Convex dashboard > Settings > Environment Variables
   - Add `WORKOS_CLIENT_ID` (same value as `VITE_WORKOS_CLIENT_ID`)

3. **Configure WorkOS**
   - Add redirect URI: `https://your-app.netlify.app/callback`
   - Add CORS origin: `https://your-app.netlify.app`

4. **Deploy Convex**
   ```bash
   npx convex deploy
   ```

5. **Deploy to Netlify**
   - Push to main branch, or
   - Trigger deploy in Netlify dashboard

6. **Test the flow**
   - Navigate directly to `/login`
   - Click "Sign in"
   - Complete WorkOS authentication
   - Verify redirect back to dashboard

## Troubleshooting

### "Page not found" on direct navigation

Check that `_redirects` exists in `dist/` after build:
```bash
npm run build && cat dist/_redirects
```

Should output:
```
/*    /index.html   200
```

### Login redirects but user stays on login page

1. Open browser console, check for errors
2. Verify CORS is configured in WorkOS
3. Verify `WORKOS_CLIENT_ID` is set in Convex
4. Run `npx convex deploy` to sync auth config

### Environment variables not working

Remember:
- `VITE_` variables are embedded at build time
- After adding variables, trigger a new Netlify deploy
- Convex variables require `npx convex deploy` to take effect

### Session not persisting on refresh

1. Check `devMode` prop on AuthKitProvider matches environment
2. Verify callback handler waits for both WorkOS and Convex auth
3. Check browser storage for AuthKit tokens

## References

- [Netlify SPA routing guide](https://answers.netlify.com/t/support-guide-i-ve-deployed-my-site-but-i-still-see-page-not-found/125)
- [Convex WorkOS AuthKit docs](https://docs.convex.dev/auth/authkit/)
- [WorkOS AuthKit React docs](https://workos.com/docs/authkit/react)
- [Vite environment variables](https://vitejs.dev/guide/env-and-mode.html)
