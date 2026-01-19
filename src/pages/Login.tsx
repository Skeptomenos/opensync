import { useAuth } from "../lib/auth";
import { useAuth as useAuthKit } from "@workos-inc/authkit-react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const ASCII_LOGO = `
 ██████╗ ██████╗ ███████╗███╗   ██╗███████╗██╗   ██╗███╗   ██╗ ██████╗
██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝
██║   ██║██████╔╝█████╗  ██╔██╗ ██║███████╗ ╚████╔╝ ██╔██╗ ██║██║     
██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║╚════██║  ╚██╔╝  ██║╚██╗██║██║     
╚██████╔╝██║     ███████╗██║ ╚████║███████║   ██║   ██║ ╚████║╚██████╗
 ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝`;

// Mock session data for the dashboard preview
const MOCK_SESSIONS = [
  { id: "01", title: "auth-flow-setup", time: "2m ago", tokens: "1.2k" },
  { id: "02", title: "api-refactor", time: "15m ago", tokens: "3.4k" },
  { id: "03", title: "search-component", time: "1h ago", tokens: "892" },
  { id: "04", title: "db-migration", time: "3h ago", tokens: "2.1k" },
];

export function LoginPage() {
  const { isAuthenticated, isLoading, signIn, signOut } = useAuth();
  // Get WorkOS user state directly to detect auth sync issues
  const { user: workosUser, isLoading: workosLoading } = useAuthKit();

  // Show loading state while processing callback or checking auth
  if (isLoading || workosLoading) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500 mx-auto" />
          <p className="mt-3 text-sm text-zinc-500">Signing in...</p>
        </div>
      </div>
    );
  }

  // If fully authenticated with both WorkOS and Convex, go to dashboard
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Check if user is logged into WorkOS but Convex auth failed
  const hasWorkosUser = !!workosUser;
  const authSyncIssue = hasWorkosUser && !isAuthenticated;

  return (
    <div className="min-h-screen bg-[#0E0E0E] text-zinc-100">
      {/* Subtle gradient overlay */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.02),_transparent_50%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        {/* Main content */}
        <main className="flex flex-1 items-center">
          <div className="grid w-full gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left side: ASCII logo and text */}
            <div className="flex flex-col justify-center">
              {/* ASCII Logo */}
              <pre className="overflow-x-auto text-[7px] leading-tight text-zinc-500 md:text-[9px]">
                {ASCII_LOGO}
              </pre>

              {/* Tagline */}
              <h2 className="mt-6 text-lg font-medium text-zinc-200 sm:text-xl">
                Dashboards for OpenCode and Claude coding sessions
              </h2>
              <p className="mt-2 text-sm text-zinc-300 sm:text-base">
                Cloud-synced dashboards that track session activity, tool usage, and token spend across projects.
              </p>

              {/* Feature list - colors from VSCode TypeScript theme */}
              <div className="mt-6 space-y-2 text-sm text-zinc-500">
                <p>
                  <span className="text-[#c586c0] font-mono">Sync</span> sessions from CLI
                  to cloud
                </p>
                <p>
                  <span className="text-[#dcdcaa] font-mono">Search</span> with full text
                  and semantic lookup
                </p>
                <p>
                  <span className="text-[#ce9178] font-mono">Private</span> your data stays
                  in your account. 
                </p>
                <p>
                  <span className="text-[#9cdcfe] font-mono">Export</span> sessions for
                  evals in DeepEval, OpenAI, or plain text
                </p>
                <p>
                  <span className="text-[#FF6541] font-mono">Delete</span> your data, your control, delete your sessions anytime.
                </p>
              </div>

              {/* CTA */}
              {authSyncIssue ? (
                <div className="mt-8 space-y-3">
                  <div className="rounded-md border border-amber-800/50 bg-amber-900/20 px-4 py-3">
                    <p className="text-sm text-amber-200">
                      Signed in as {workosUser?.email}
                    </p>
                    <p className="mt-1 text-xs text-amber-400/70">
                      Backend sync pending. Try signing out and back in.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={signOut}
                      className="w-fit rounded-md border border-zinc-700 bg-[#0E0E0E] px-6 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
                    >
                      Sign out
                    </button>
                    <button
                      onClick={signIn}
                      className="w-fit rounded-md border border-zinc-600 bg-zinc-800 px-6 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-8 flex gap-3">
                  <button
                    onClick={signIn}
                    className="w-fit rounded-md border border-zinc-700 bg-[#0E0E0E] px-6 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    Sign in
                  </button>
                  <a
                    href="/docs"
                    className="w-fit rounded-md border border-zinc-700 bg-[#0E0E0E] px-6 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-900"
                  >
                    Docs
                  </a>
                </div>
              )}

              {/* Export formats */}
              <div className="mt-6 flex flex-wrap gap-4 text-xs text-zinc-600">
                <span>JSON</span>
                <span>JSONL</span>
                <span>Markdown</span>
                <span>Token stats</span>
              </div>

              {/* Trust message */}
              <div className="mt-6 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                <p className="text-xs text-zinc-400">
                  Your sessions stay private. Unsync or delete your data from the database anytime.
                </p>
              </div>
            </div>

            {/* Right side: Mini dashboard mock + Getting started */}
            <div className="hidden lg:flex lg:flex-col lg:gap-6">
              {/* Dashboard preview */}
              <div className="overflow-hidden rounded-lg border border-zinc-800 bg-[#161616]">
                {/* Window chrome */}
                <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                  </div>
                  <span className="ml-2 text-xs text-zinc-500">
                    opensync dashboard
                  </span>
                </div>

                {/* Dashboard content */}
                <div className="flex">
                  {/* Sidebar */}
                  <div className="w-48 border-r border-zinc-800 p-3">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                      Sessions
                    </p>
                    <div className="space-y-1">
                      {MOCK_SESSIONS.map((session, i) => (
                        <div
                          key={session.id}
                          className={`cursor-pointer rounded px-2 py-1.5 text-xs ${
                            i === 0
                              ? "bg-zinc-800 text-zinc-200"
                              : "text-zinc-500 hover:bg-zinc-800/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-600">{session.id}</span>
                            <span className="truncate">{session.title}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main panel */}
                  <div className="flex-1 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-300">
                          auth-flow-setup
                        </p>
                        <p className="text-xs text-zinc-600">2 minutes ago</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                          1.2k tokens
                        </span>
                        <span className="rounded bg-emerald-900/30 px-2 py-0.5 text-[10px] text-emerald-400">
                          synced
                        </span>
                      </div>
                    </div>

                    {/* Mock message preview */}
                    <div className="space-y-3 rounded border border-zinc-800 bg-[#0E0E0E] p-3">
                      <div className="text-xs">
                        <p className="mb-1 text-zinc-600">user</p>
                        <p className="text-zinc-400">
                          Add authentication to the API routes
                        </p>
                      </div>
                      <div className="text-xs">
                        <p className="mb-1 text-zinc-600">assistant</p>
                        <p className="text-zinc-400">
                          I'll add JWT validation middleware...
                        </p>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded bg-zinc-800/50 p-2">
                        <p className="text-lg font-medium text-zinc-300">24</p>
                        <p className="text-[10px] text-zinc-600">sessions</p>
                      </div>
                      <div className="rounded bg-zinc-800/50 p-2">
                        <p className="text-lg font-medium text-zinc-300">
                          42.1k
                        </p>
                        <p className="text-[10px] text-zinc-600">tokens</p>
                      </div>
                      <div className="rounded bg-zinc-800/50 p-2">
                        <p className="text-lg font-medium text-zinc-300">3</p>
                        <p className="text-[10px] text-zinc-600">shared</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Getting started section */}
              <div className="rounded-lg border border-zinc-800 bg-[#161616] p-4">
                <h3 className="text-sm font-medium text-zinc-300">
                  Getting started
                </h3>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Install one of the sync plugins to send session data to your dashboard.
                </p>

                <div className="mt-3 space-y-2">
                  {/* Claude Code Sync */}
                  <a
                    href="https://www.npmjs.com/package/claude-code-sync"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between rounded-md border border-zinc-800 bg-[#0E0E0E] px-3 py-2 transition-colors hover:border-zinc-700"
                  >
                    <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-300">
                      claude-code-sync
                    </span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600">
                      npm
                    </span>
                  </a>

                  {/* OpenCode Sync Plugin */}
                  <a
                    href="https://www.npmjs.com/package/opencode-sync-plugin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between rounded-md border border-zinc-800 bg-[#0E0E0E] px-3 py-2 transition-colors hover:border-zinc-700"
                  >
                    <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-300">
                      opencode-sync-plugin
                    </span>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600">
                      npm
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-8 flex flex-col items-center gap-3 text-xs text-zinc-600">
          <a
            href="https://github.com/waynesutton/opensync"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Open Source project
          </a>
          <div className="flex flex-col items-center gap-2">
            <span>built with</span>
            <div className="flex items-center gap-3">
              <a
                href="https://convex.dev/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
                title="Convex"
              >
                <img
                  src="/convex.svg"
                  alt="Convex"
                  className="h-4 w-auto invert"
                />
              </a>
              <span className="text-zinc-500">+</span>
              <a
                href="https://workos.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
                title="WorkOS"
              >
                <img
                  src="/workos.svg"
                  alt="WorkOS"
                  className="h-5 w-auto invert"
                />
              </a>
              <span className="text-zinc-500">+</span>
              <a
                href="https://netlify.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
                title="Netlify"
              >
                <img
                  src="/netlify-logo.svg"
                  alt="Netlify"
                  className="h-6 w-auto"
                />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
