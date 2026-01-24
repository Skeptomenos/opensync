/**
 * Error display components for the OpenSync dashboard.
 *
 * Provides consistent error UI across the application:
 * - ErrorFallback: Full-page error fallback for ErrorBoundary
 * - ErrorAlert: Inline error alert for recoverable errors
 * - ErrorCard: Card-style error display for data fetch failures
 *
 * All components are theme-aware (dark/tan) and follow the app's design system.
 */

import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";
import { AlertTriangle, RefreshCw, X, ServerCrash, WifiOff } from "lucide-react";
import type { FallbackProps } from "react-error-boundary";

// ─────────────────────────────────────────────────────────────────────────────
// Helper to extract error info from unknown error type
// ─────────────────────────────────────────────────────────────────────────────

function getErrorInfo(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: "An unexpected error occurred" };
}

// ─────────────────────────────────────────────────────────────────────────────
// ErrorFallback - Full-page error for React ErrorBoundary
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorFallbackProps extends FallbackProps {
  /** Optional custom title */
  title?: string;
}

/**
 * Full-page error fallback for use with React ErrorBoundary.
 * Shows error details and provides a retry button.
 */
export function ErrorFallback({
  error,
  resetErrorBoundary,
  title = "Something went wrong",
}: ErrorFallbackProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Extract error message and stack from unknown error type
  const { message: errorMessage, stack: errorStack } = getErrorInfo(error);

  return (
    <div
      className={cn(
        "min-h-screen flex items-center justify-center p-4",
        isDark ? "bg-[#0E0E0E]" : "bg-[#faf8f5]"
      )}
    >
      <div
        className={cn(
          "max-w-md w-full rounded-lg border p-6 text-center",
          isDark
            ? "bg-zinc-900/50 border-zinc-800"
            : "bg-[#f5f3f0] border-[#e6e4e1]"
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            "mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4",
            isDark ? "bg-red-900/20" : "bg-red-100"
          )}
        >
          <ServerCrash
            className={cn(
              "h-6 w-6",
              isDark ? "text-red-400" : "text-red-600"
            )}
          />
        </div>

        {/* Title */}
        <h2
          className={cn(
            "text-lg font-medium mb-2",
            isDark ? "text-zinc-200" : "text-[#1a1a1a]"
          )}
        >
          {title}
        </h2>

        {/* Error message */}
        <p
          className={cn(
            "text-sm mb-4",
            isDark ? "text-zinc-400" : "text-[#6b6b6b]"
          )}
        >
          {errorMessage}
        </p>

        {/* Error details (collapsed) */}
        {errorStack && (
          <details
            className={cn(
              "text-left mb-4 rounded border overflow-hidden",
              isDark
                ? "border-zinc-800 bg-zinc-900/30"
                : "border-[#e6e4e1] bg-[#f5f3f0]"
            )}
          >
            <summary
              className={cn(
                "px-3 py-2 text-xs cursor-pointer",
                isDark
                  ? "text-zinc-500 hover:text-zinc-400"
                  : "text-[#6b6b6b] hover:text-[#1a1a1a]"
              )}
            >
              Show technical details
            </summary>
            <pre
              className={cn(
                "px-3 py-2 text-xs overflow-auto max-h-32",
                isDark ? "text-zinc-500" : "text-[#6b6b6b]"
              )}
            >
              {errorStack}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetErrorBoundary}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors",
              isDark
                ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "bg-[#1a1a1a] text-white hover:bg-[#333]"
            )}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className={cn(
              "px-4 py-2 text-sm rounded transition-colors",
              isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#ebe9e6]"
            )}
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ErrorAlert - Inline dismissible alert
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorAlertProps {
  /** Error message to display */
  message: string;
  /** Optional title for the alert */
  title?: string;
  /** Called when dismiss button is clicked */
  onDismiss?: () => void;
  /** Called when retry button is clicked */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Inline error alert for recoverable errors.
 * Can be dismissed or retried.
 */
export function ErrorAlert({
  message,
  title,
  onDismiss,
  onRetry,
  className,
}: ErrorAlertProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        isDark
          ? "bg-red-900/10 border-red-900/30"
          : "bg-red-50 border-red-200",
        className
      )}
      role="alert"
    >
      {/* Icon */}
      <AlertTriangle
        className={cn(
          "h-5 w-5 flex-shrink-0 mt-0.5",
          isDark ? "text-red-400" : "text-red-600"
        )}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && (
          <p
            className={cn(
              "text-sm font-medium mb-0.5",
              isDark ? "text-red-400" : "text-red-800"
            )}
          >
            {title}
          </p>
        )}
        <p
          className={cn(
            "text-sm",
            isDark ? "text-red-400/80" : "text-red-700"
          )}
        >
          {message}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 text-xs font-medium transition-colors",
              isDark
                ? "text-red-400 hover:text-red-300"
                : "text-red-700 hover:text-red-800"
            )}
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "flex-shrink-0 p-1 rounded transition-colors",
            isDark
              ? "text-red-400/60 hover:text-red-400 hover:bg-red-900/20"
              : "text-red-400 hover:text-red-600 hover:bg-red-100"
          )}
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ErrorCard - Card-style error for data fetch failures
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorCardProps {
  /** Error message to display */
  message: string;
  /** Optional title for the card */
  title?: string;
  /** Called when retry button is clicked */
  onRetry?: () => void;
  /** Type of error for icon selection */
  variant?: "generic" | "network" | "server";
  /** Additional CSS classes */
  className?: string;
}

/**
 * Card-style error display for data fetch failures.
 * Use in place of content when a query fails.
 */
export function ErrorCard({
  message,
  title = "Failed to load",
  onRetry,
  variant = "generic",
  className,
}: ErrorCardProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Select icon based on variant
  const Icon = variant === "network" ? WifiOff : variant === "server" ? ServerCrash : AlertTriangle;

  return (
    <div
      className={cn(
        "rounded-lg border p-6 text-center",
        isDark
          ? "bg-zinc-900/30 border-zinc-800"
          : "bg-[#f5f3f0] border-[#e6e4e1]",
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3",
          isDark ? "bg-zinc-800" : "bg-[#ebe9e6]"
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5",
            isDark ? "text-zinc-500" : "text-[#6b6b6b]"
          )}
        />
      </div>

      {/* Title */}
      <h3
        className={cn(
          "text-sm font-medium mb-1",
          isDark ? "text-zinc-300" : "text-[#1a1a1a]"
        )}
      >
        {title}
      </h3>

      {/* Message */}
      <p
        className={cn(
          "text-sm mb-4",
          isDark ? "text-zinc-500" : "text-[#6b6b6b]"
        )}
      >
        {message}
      </p>

      {/* Retry button */}
      {onRetry && (
        <button
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors",
            isDark
              ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#ebe9e6]"
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConnectionError - Pocketbase connection failure
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectionErrorProps {
  /** Called when retry button is clicked */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Connection error display for when Pocketbase is unreachable.
 * Used by PocketbaseProvider when connection fails.
 */
export function ConnectionError({ onRetry, className }: ConnectionErrorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={cn(
        "min-h-screen flex items-center justify-center p-4",
        isDark ? "bg-[#0E0E0E]" : "bg-[#faf8f5]",
        className
      )}
    >
      <div className="max-w-sm w-full text-center">
        {/* Icon */}
        <div
          className={cn(
            "mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4",
            isDark ? "bg-zinc-800" : "bg-[#ebe9e6]"
          )}
        >
          <WifiOff
            className={cn(
              "h-6 w-6",
              isDark ? "text-zinc-500" : "text-[#6b6b6b]"
            )}
          />
        </div>

        {/* Title */}
        <h2
          className={cn(
            "text-lg font-medium mb-2",
            isDark ? "text-zinc-200" : "text-[#1a1a1a]"
          )}
        >
          Connection Error
        </h2>

        {/* Message */}
        <p
          className={cn(
            "text-sm mb-6",
            isDark ? "text-zinc-400" : "text-[#6b6b6b]"
          )}
        >
          Unable to connect to the server. Please check your connection and try again.
        </p>

        {/* Actions */}
        <button
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors",
            isDark
              ? "bg-zinc-100 text-zinc-900 hover:bg-white"
              : "bg-[#1a1a1a] text-white hover:bg-[#333]"
          )}
        >
          <RefreshCw className="h-4 w-4" />
          Retry connection
        </button>
      </div>
    </div>
  );
}
