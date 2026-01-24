/**
 * SessionViewer - Full session detail view with actions
 * 
 * Migrated from Convex to Pocketbase hooks.
 * 
 * Changes from Convex version:
 * - useMutation(api.sessions.setVisibility) → useSession().setVisibility
 * - useMutation(api.sessions.remove) → useSession().deleteSession
 * - useQuery(api.sessions.getMarkdown) → useSession().markdown
 * - Id<"sessions"> and Id<"messages"> → string
 * 
 * @see ralph-wiggum/specs/POCKETBASE_MIGRATION.md - Migration spec
 * @see src/hooks/useSession.ts - Pocketbase hook implementation
 */

import { useState } from "react";
import { useSession } from "../hooks/useSession";
import { cn } from "../lib/utils";
import { ConfirmModal } from "./ConfirmModal";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy,
  Check,
  Download,
  Globe,
  Lock,
  Trash2,
  ExternalLink,
  User,
  Bot,
  Wrench,
  Cpu,
  Clock,
  Coins,
  Loader2,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface SessionViewerProps {
  /** Session ID to display. The component fetches session data internally. */
  sessionId: string;
  /** Enable realtime updates for the session */
  realtime?: boolean;
  /** Callback when session is deleted */
  onDeleted?: () => void;
}

/**
 * Legacy props interface for backward compatibility.
 * Use SessionViewerProps (sessionId-based) for new code.
 * 
 * @deprecated Use sessionId prop instead of passing session/messages directly
 */
interface LegacySessionViewerProps {
  session: {
    id: string;
    title?: string;
    projectPath?: string;
    model?: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    durationMs?: number;
    isPublic: boolean;
    publicSlug?: string;
    created: string;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system" | "unknown";
    textContent?: string;
    createdAt: number;
    parts: Array<{ type: string; content: unknown }>;
  }>;
  /** Markdown content (pre-generated) */
  markdown?: string;
  /** Toggle visibility callback */
  onToggleVisibility?: (isPublic: boolean) => Promise<void>;
  /** Delete callback */
  onDelete?: () => Promise<void>;
  /** Whether mutation is in progress */
  isMutating?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * SessionViewer displays a full session with messages and actions.
 * 
 * Two usage modes:
 * 1. **Recommended**: Pass `sessionId` - component handles data fetching
 * 2. **Legacy/External**: Pass `session` and `messages` props directly
 * 
 * @example
 * ```tsx
 * // Recommended: Let component handle fetching
 * <SessionViewer sessionId="abc123" realtime />
 * 
 * // Legacy: Pass data externally (for Dashboard inline rendering)
 * <SessionViewer 
 *   session={sessionData} 
 *   messages={messagesList}
 *   markdown={md}
 *   onToggleVisibility={handleToggle}
 *   onDelete={handleDelete}
 * />
 * ```
 */
export function SessionViewer(
  props: SessionViewerProps | LegacySessionViewerProps
) {
  // Detect which props mode is being used
  if ("sessionId" in props) {
    return <SessionViewerInternal {...props} />;
  } else {
    return <SessionViewerLegacy {...props} />;
  }
}

// ============================================================================
// Internal Implementation (uses useSession hook)
// ============================================================================

function SessionViewerInternal({ 
  sessionId, 
  realtime = false,
  onDeleted,
}: SessionViewerProps) {
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const {
    session,
    isLoading,
    error,
    markdown,
    setVisibility,
    deleteSession,
    isMutating,
  } = useSession({ sessionId, realtime });

  const handleCopy = async () => {
    if (markdown) {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (markdown && session) {
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.title || "session"}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleToggleVisibility = async () => {
    if (session) {
      await setVisibility(!session.isPublic);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    await deleteSession();
    setShowDeleteModal(false);
    onDeleted?.();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "N/A";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-destructive">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Session not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 bg-card">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {session.title || "Untitled Session"}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
              {session.projectPath && <span>{session.projectPath}</span>}
              {session.model && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    {session.model}
                  </span>
                </>
              )}
              <span>·</span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {session.totalTokens.toLocaleString()} tokens
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                ${session.cost.toFixed(4)}
              </span>
              {session.durationMs && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(session.durationMs)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              disabled={isMutating}
              className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Copy as Markdown"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={handleDownload}
              disabled={isMutating}
              className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={handleToggleVisibility}
              disabled={isMutating}
              className={cn(
                "p-2 rounded hover:bg-accent disabled:opacity-50",
                session.isPublic ? "text-green-500" : "text-muted-foreground hover:text-foreground"
              )}
              title={session.isPublic ? "Make Private" : "Make Public"}
            >
              {isMutating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : session.isPublic ? (
                <Globe className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
            </button>
            {session.isPublic && session.publicSlug && (
              <a
                href={`/s/${session.publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                title="Open Public Link"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={handleDelete}
              disabled={isMutating}
              className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-destructive disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {session.messages.map((message) => (
          <MessageBlock key={message.id} message={message} />
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete Session"
        message="Delete this session? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

// ============================================================================
// Legacy Implementation (receives props externally)
// ============================================================================

function SessionViewerLegacy({ 
  session, 
  messages,
  markdown,
  onToggleVisibility,
  onDelete,
  isMutating = false,
}: LegacySessionViewerProps) {
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleCopy = async () => {
    if (markdown) {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (markdown) {
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.title || "session"}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleToggleVisibility = async () => {
    await onToggleVisibility?.(!session.isPublic);
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    await onDelete?.();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "N/A";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 bg-card">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {session.title || "Untitled Session"}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
              {session.projectPath && <span>{session.projectPath}</span>}
              {session.model && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    {session.model}
                  </span>
                </>
              )}
              <span>·</span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {session.totalTokens.toLocaleString()} tokens
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                ${session.cost.toFixed(4)}
              </span>
              {session.durationMs && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(session.durationMs)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              disabled={isMutating || !markdown}
              className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Copy as Markdown"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={handleDownload}
              disabled={isMutating || !markdown}
              className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
            {onToggleVisibility && (
              <button
                onClick={handleToggleVisibility}
                disabled={isMutating}
                className={cn(
                  "p-2 rounded hover:bg-accent disabled:opacity-50",
                  session.isPublic ? "text-green-500" : "text-muted-foreground hover:text-foreground"
                )}
                title={session.isPublic ? "Make Private" : "Make Public"}
              >
                {isMutating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : session.isPublic ? (
                  <Globe className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
              </button>
            )}
            {session.isPublic && session.publicSlug && (
              <a
                href={`/s/${session.publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                title="Open Public Link"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                disabled={isMutating}
                className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-destructive disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((message) => (
          <MessageBlock key={message.id} message={message} />
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {onDelete && (
        <ConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={confirmDelete}
          title="Delete Session"
          message="Delete this session? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      )}
    </div>
  );
}

// ============================================================================
// Message Components
// ============================================================================

interface MessageProps {
  id: string;
  role: "user" | "assistant" | "system" | "unknown";
  textContent?: string;
  createdAt: number;
  parts: Array<{ type: string; content: unknown }>;
}

function MessageBlock({ message }: { message: MessageProps }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Check if parts have any displayable content
  const hasPartsContent = message.parts?.some((part) => {
    if (part.type === "text") {
      const text = getTextContent(part.content);
      return text && text.trim().length > 0;
    }
    return part.type === "tool-call" || part.type === "tool-result";
  });

  // Use textContent as fallback if no parts have content
  const showFallback = !hasPartsContent && message.textContent;

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-primary text-primary-foreground"
            : isSystem
            ? "bg-yellow-500/20 text-yellow-500"
            : "bg-accent text-accent-foreground"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : isSystem ? (
          <Wrench className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      <div className={cn("flex-1 max-w-3xl", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-lg p-4",
            isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border"
          )}
        >
          {showFallback ? (
            // Fallback: render textContent when parts are empty
            <div className={cn("prose prose-sm max-w-none", isUser ? "prose-invert" : "dark:prose-invert")}>
              <ReactMarkdown
                components={{
                  code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.textContent || ""}
              </ReactMarkdown>
            </div>
          ) : (
            // Normal: render parts
            message.parts?.map((part, i: number) => (
              <PartRenderer key={i} part={part} isUser={isUser} />
            ))
          )}
        </div>
        <span className="text-xs text-muted-foreground mt-1">
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract text content from various formats.
 * Claude Code may store content as { text: "..." } or { content: "..." }
 */
function getTextContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }
  return "";
}

/**
 * Extract tool call details from various formats.
 */
function getToolCallDetails(content: unknown): { name: string; args: unknown } {
  if (!content || typeof content !== "object") {
    return { name: "Unknown Tool", args: {} };
  }
  const obj = content as Record<string, unknown>;
  return {
    name: (obj.name as string) || (obj.toolName as string) || "Unknown Tool",
    args: obj.args || obj.arguments || obj.input || {},
  };
}

/**
 * Extract tool result from various formats.
 */
function getToolResult(content: unknown): string {
  if (!content) return "";
  if (typeof content !== "object") return String(content);
  const obj = content as Record<string, unknown>;
  const result = obj.result ?? obj.output ?? content;
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// Part Renderer
// ============================================================================

function PartRenderer({ part, isUser }: { part: { type: string; content: unknown }; isUser: boolean }) {
  if (part.type === "text") {
    const textContent = getTextContent(part.content);
    
    // Skip empty text parts
    if (!textContent) return null;
    
    return (
      <div className={cn("prose prose-sm max-w-none", isUser ? "prose-invert" : "dark:prose-invert")}>
        <ReactMarkdown
          components={{
            code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) {
              const match = /language-(\w+)/.exec(className || "");
              return !inline && match ? (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {textContent}
        </ReactMarkdown>
      </div>
    );
  }

  if (part.type === "tool-call") {
    const { name, args } = getToolCallDetails(part.content);
    return (
      <div className="my-2 p-3 rounded bg-accent/50 border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wrench className="h-4 w-4" />
          {name}
        </div>
        <pre className="mt-2 text-xs overflow-x-auto text-muted-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>
    );
  }

  if (part.type === "tool-result") {
    const result = getToolResult(part.content);
    return (
      <div className="my-2 p-3 rounded bg-green-500/10 border border-green-500/20">
        <pre className="text-xs overflow-x-auto text-foreground">
          {result}
        </pre>
      </div>
    );
  }

  return null;
}
