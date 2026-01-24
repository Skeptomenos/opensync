/**
 * Error Boundary components for catching and displaying React errors.
 *
 * Uses react-error-boundary for a declarative approach to error handling.
 * Provides:
 * - AppErrorBoundary: Root-level error boundary for the entire app
 * - PageErrorBoundary: Page-level error boundary for individual routes
 * - SectionErrorBoundary: Section-level for data-driven UI sections
 */

import { ReactNode, useCallback } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback, ErrorCard } from "./ui/Error";

// ─────────────────────────────────────────────────────────────────────────────
// AppErrorBoundary - Root-level error boundary
// ─────────────────────────────────────────────────────────────────────────────

interface AppErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Root-level error boundary for the entire application.
 * Catches unhandled errors in the React component tree and displays
 * a full-page fallback UI.
 *
 * Usage: Wrap in main.tsx around all providers
 */
export function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  const handleError = useCallback((error: unknown, info: { componentStack?: string | null }) => {
    // Log error details for debugging
    console.error("App Error Boundary caught error:", error);
    console.error("Component stack:", info.componentStack);

    // Future: Send to error tracking service (Sentry, etc.)
  }, []);

  const handleReset = useCallback(() => {
    // Clear any cached state that might cause the error to recur
    // Then reload the page for a fresh start
    window.location.reload();
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={handleReset}
    >
      {children}
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PageErrorBoundary - Page-level error boundary
// ─────────────────────────────────────────────────────────────────────────────

interface PageErrorBoundaryProps {
  children: ReactNode;
  /** Called when the user clicks "Try again" */
  onReset?: () => void;
}

/**
 * Page-level error boundary for individual routes.
 * Allows recovery without reloading the entire app.
 *
 * Usage: Wrap around page components in App.tsx routes
 */
export function PageErrorBoundary({ children, onReset }: PageErrorBoundaryProps) {
  const handleError = useCallback((error: unknown, info: { componentStack?: string | null }) => {
    console.error("Page Error Boundary caught error:", error);
    console.error("Component stack:", info.componentStack);
  }, []);

  const handleReset = useCallback(() => {
    // Call custom reset handler if provided
    onReset?.();
  }, [onReset]);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={handleReset}
    >
      {children}
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionErrorBoundary - Section-level for data components
// ─────────────────────────────────────────────────────────────────────────────

interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** Called when the user clicks "Retry" */
  onReset?: () => void;
  /** Title for the error card */
  title?: string;
  /** Additional CSS classes for the error card */
  className?: string;
}

/**
 * Section-level error boundary for data-driven UI sections.
 * Shows a compact error card instead of a full-page error.
 *
 * Usage: Wrap around data-dependent sections (charts, lists, etc.)
 */
export function SectionErrorBoundary({
  children,
  onReset,
  title = "Failed to load",
  className,
}: SectionErrorBoundaryProps) {
  const handleError = useCallback((error: unknown, info: { componentStack?: string | null }) => {
    console.error("Section Error Boundary caught error:", error);
    console.error("Component stack:", info.componentStack);
  }, []);

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => {
        const errorMessage = error instanceof Error ? error.message : "An error occurred";
        return (
          <ErrorCard
            title={title}
            message={errorMessage}
            onRetry={() => {
              onReset?.();
              resetErrorBoundary();
            }}
            className={className}
          />
        );
      }}
      onError={handleError}
    >
      {children}
    </ErrorBoundary>
  );
}

// Re-export ErrorBoundary for direct use
export { ErrorBoundary };
