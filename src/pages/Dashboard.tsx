import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";
import { SessionViewer } from "../components/SessionViewer";
import type { Id } from "../../convex/_generated/dataModel";

export function DashboardPage() {
  const { user } = useAuth();
  const [selectedSessionId, setSelectedSessionId] = useState<Id<"sessions"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: Cmd+K for search, Cmd+. for sidebar toggle
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ".") {
      e.preventDefault();
      setSidebarCollapsed((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Ensure user exists in Convex
  const getOrCreate = useMutation(api.users.getOrCreate);
  useEffect(() => {
    getOrCreate();
  }, [getOrCreate]);

  // Load sessions
  const sessionsData = useQuery(api.sessions.list, { limit: 100 });

  // Search if query present
  const searchResults = useQuery(
    api.search.searchSessions,
    searchQuery.trim() ? { query: searchQuery, limit: 20 } : "skip"
  );

  // Get selected session
  const selectedSession = useQuery(
    api.sessions.get,
    selectedSessionId ? { sessionId: selectedSessionId } : "skip"
  );

  const displaySessions = searchQuery.trim()
    ? searchResults || []
    : sessionsData?.sessions || [];

  return (
    <div className="h-screen flex flex-col bg-[#0E0E0E]">
      <Header
        ref={searchInputRef}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          sessions={displaySessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={setSelectedSessionId}
          collapsed={sidebarCollapsed}
          isSearching={!!searchQuery.trim()}
        />

        <main className="flex-1 overflow-hidden">
          {selectedSession ? (
            <SessionViewer
              session={selectedSession.session}
              messages={selectedSession.messages}
            />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <pre className="text-xs mb-4 text-zinc-600 whitespace-pre">
{`
  _____      _           _   
 / ____|    | |         | |  
| (___   ___| | ___  ___| |_ 
 \\___ \\ / _ \\ |/ _ \\/ __| __|
 ____) |  __/ |  __/ (__| |_ 
|_____/ \\___|_|\\___|\\___|\\__|
`}
        </pre>
        <p className="text-zinc-500">Select a session from the sidebar</p>
        <p className="text-sm mt-1 text-zinc-600">or search for something specific</p>
      </div>
    </div>
  );
}
