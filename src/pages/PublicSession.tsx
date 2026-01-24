import { useParams, Link } from "react-router-dom";
import { usePublicSession } from "../hooks";
import { ArrowLeft, Loader2, User, Bot, Wrench, Sun, Moon } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme, getThemeClasses } from "../lib/theme";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// Helper to extract text content from various formats
// Claude Code may store content as { text: "..." } or { content: "..." }
function getTextContent(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  // Handle object formats from different plugins
  return content.text || content.content || "";
}

// Helper to extract tool call details from various formats
function getToolCallDetails(content: any): { name: string; args: any } {
  if (!content) return { name: "Unknown Tool", args: {} };
  return {
    name: content.name || content.toolName || "Unknown Tool",
    args: content.args || content.arguments || content.input || {},
  };
}

// Helper to extract tool result from various formats
function getToolResult(content: any): string {
  if (!content) return "";
  const result = content.result || content.output || content;
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

export function PublicSessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { theme, toggleTheme } = useTheme();
  const t = getThemeClasses(theme);
  const { data } = usePublicSession({ slug });

  if (data === undefined) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", t.bgPrimary)}>
        <Loader2 className={cn("h-8 w-8 animate-spin", t.textMuted)} />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", t.bgPrimary)}>
        <div className="text-center">
          <h1 className={cn("text-2xl font-bold mb-2", t.textPrimary)}>
            Session Not Found
          </h1>
          <p className={cn("mb-4", t.textMuted)}>
            This session may be private or deleted.
          </p>
          <Link
            to="/"
            className={cn("inline-flex items-center gap-2 hover:underline", t.interactive)}
          >
            <ArrowLeft className="h-4 w-4" />
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const { session, messages } = data;

  return (
    <div className={cn("min-h-screen", t.bgPrimary)}>
      <header className={cn("border-b sticky top-0 z-10", t.border, t.bgPrimary)}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className={cn("flex items-center gap-2 transition-colors", t.textMuted, "hover:opacity-80")}
          >
            <ArrowLeft className="h-4 w-4" />
            OpenSync
          </Link>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs", t.textDim)}>Public Session</span>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={cn("p-1.5 rounded transition-colors", t.textSubtle, t.bgHover)}
              title={theme === "dark" ? "Switch to tan mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <div className={cn("max-w-4xl mx-auto px-4 py-6 border-b", t.border)}>
        <h1 className={cn("text-2xl font-bold mb-2", t.textPrimary)}>
          {session.title || "Untitled Session"}
        </h1>
        <div className={cn("flex flex-wrap items-center gap-3 text-sm", t.textMuted)}>
          {session.projectPath && <span>{session.projectPath}</span>}
          {session.model && (
            <>
              <span>·</span>
              <span>{session.model}</span>
            </>
          )}
          <span>·</span>
          <span>{session.totalTokens.toLocaleString()} tokens</span>
          <span>·</span>
          <span>{new Date(session.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {messages.map((message: any) => (
          <MessageBlock key={message._id} message={message} theme={theme} />
        ))}
      </div>

      <footer className={cn("border-t py-8 text-center text-sm", t.border, t.textMuted)}>
        <p>
          Shared via{" "}
          <Link to="/" className={cn("hover:underline", t.interactive)}>
            OpenSync
          </Link>
        </p>
      </footer>
    </div>
  );
}

function MessageBlock({ message, theme }: { message: any; theme: "dark" | "tan" }) {
  const t = getThemeClasses(theme);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Check if parts have any displayable content
  const hasPartsContent = message.parts?.some((part: any) => {
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
            ? t.bgUserBubble
            : isSystem
            ? "bg-yellow-500/20 text-yellow-500"
            : t.bgAssistantBubble
        )}
      >
        {isUser ? (
          <User className={cn("h-4 w-4", t.textMuted)} />
        ) : isSystem ? (
          <Wrench className="h-4 w-4" />
        ) : (
          <Bot className={cn("h-4 w-4", t.textSubtle)} />
        )}
      </div>

      <div className={cn("flex-1 max-w-3xl", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-lg p-4",
            isUser 
              ? cn(t.bgUserBubble, t.textPrimary) 
              : cn(t.bgCard, "border", t.border)
          )}
        >
          {showFallback ? (
            // Fallback: render textContent when parts are empty
            <div className={cn(
              "prose prose-sm max-w-none",
              theme === "dark" 
                ? "prose-invert" 
                : "prose-neutral text-[#1a1a1a] prose-headings:text-[#1a1a1a] prose-p:text-[#1a1a1a] prose-strong:text-[#1a1a1a] prose-code:text-[#1a1a1a]"
            )}>
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
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
                      <code className={cn(className, theme === "tan" && "bg-[#e6e4e1] text-[#1a1a1a]")} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.textContent}
              </ReactMarkdown>
            </div>
          ) : (
            // Normal: render parts
            message.parts?.map((part: any, i: number) => (
              <PartRenderer key={i} part={part} theme={theme} />
            ))
          )}
        </div>
        <span className={cn("text-xs mt-1", t.textDim)}>
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

function PartRenderer({ part, theme }: { part: any; theme: "dark" | "tan" }) {
  const t = getThemeClasses(theme);

  if (part.type === "text") {
    const textContent = getTextContent(part.content);
    
    // Skip empty text parts
    if (!textContent) return null;
    
    return (
      <div className={cn(
        "prose prose-sm max-w-none",
        theme === "dark" 
          ? "prose-invert" 
          : "prose-neutral text-[#1a1a1a] prose-headings:text-[#1a1a1a] prose-p:text-[#1a1a1a] prose-strong:text-[#1a1a1a] prose-code:text-[#1a1a1a]"
      )}>
        <ReactMarkdown
          components={{
            code({ node, inline, className, children, ...props }: any) {
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
                <code className={cn(className, theme === "tan" && "bg-[#e6e4e1] text-[#1a1a1a]")} {...props}>
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
      <div className={cn("my-2 p-3 rounded border", t.bgCode, t.border)}>
        <div className={cn("flex items-center gap-2 text-sm font-medium", t.textPrimary)}>
          <Wrench className="h-4 w-4" />
          {name}
        </div>
        <pre className={cn("mt-2 text-xs overflow-x-auto", t.textMuted)}>
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>
    );
  }

  if (part.type === "tool-result") {
    const result = getToolResult(part.content);
    return (
      <div className="my-2 p-3 rounded bg-green-500/10 border border-green-500/20">
        <pre className={cn("text-xs overflow-x-auto", t.textPrimary)}>
          {result}
        </pre>
      </div>
    );
  }

  return null;
}
