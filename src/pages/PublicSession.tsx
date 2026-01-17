import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ArrowLeft, Loader2, User, Bot, Wrench } from "lucide-react";
import { cn } from "../lib/utils";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export function PublicSessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const data = useQuery(api.sessions.getPublic, { slug: slug || "" });

  if (data === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Session Not Found
          </h1>
          <p className="text-muted-foreground mb-4">
            This session may be private or deleted.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-primary hover:underline"
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            OpenSync
          </Link>
          <span className="text-xs text-muted-foreground">Public Session</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {session.title || "Untitled Session"}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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
          <MessageBlock key={message._id} message={message} />
        ))}
      </div>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>
          Shared via{" "}
          <Link to="/" className="text-primary hover:underline">
            OpenSync
          </Link>
        </p>
      </footer>
    </div>
  );
}

function MessageBlock({ message }: { message: any }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

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
          {message.parts.map((part: any, i: number) => (
            <PartRenderer key={i} part={part} isUser={isUser} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PartRenderer({ part, isUser }: { part: any; isUser: boolean }) {
  if (part.type === "text") {
    return (
      <div className={cn("prose prose-sm max-w-none", isUser ? "prose-invert" : "dark:prose-invert")}>
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
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {part.content}
        </ReactMarkdown>
      </div>
    );
  }

  if (part.type === "tool-call") {
    return (
      <div className="my-2 p-3 rounded bg-accent/50 border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wrench className="h-4 w-4" />
          {part.content.name}
        </div>
        <pre className="mt-2 text-xs overflow-x-auto text-muted-foreground">
          {JSON.stringify(part.content.args, null, 2)}
        </pre>
      </div>
    );
  }

  return null;
}
