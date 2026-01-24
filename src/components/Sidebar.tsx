import { useState } from "react";
import { cn } from "../lib/utils";
import {
  MessageSquare,
  ChevronRight,
  Folder,
  Clock,
  Globe,
  Lock,
  Cpu,
} from "lucide-react";

interface Session {
  id: string;
  externalId: string;
  title?: string;
  projectPath?: string;
  projectName?: string;
  model?: string;
  totalTokens: number;
  cost: number;
  isPublic: boolean;
  messageCount: number;
  created: string;
  updated: string;
}

interface SidebarProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  collapsed: boolean;
  isSearching: boolean;
}

export function Sidebar({
  sessions,
  selectedSessionId,
  onSelectSession,
  collapsed,
  isSearching,
}: SidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(["default"])
  );

  // Group by project
  const sessionsByProject = sessions.reduce((acc, session) => {
    const project = session.projectName || session.projectPath || "Other";
    if (!acc[project]) acc[project] = [];
    acc[project].push(session);
    return acc;
  }, {} as Record<string, Session[]>);

  const toggleProject = (project: string) => {
    const next = new Set(expandedProjects);
    if (next.has(project)) {
      next.delete(project);
    } else {
      next.add(project);
    }
    setExpandedProjects(next);
  };

  if (collapsed) {
    return (
      <div className="w-12 border-r border-zinc-800 bg-[#161616] flex flex-col items-center py-2 gap-1">
        {sessions.slice(0, 10).map((session) => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={cn(
              "p-2 rounded hover:bg-zinc-800",
              selectedSessionId === session.id && "bg-zinc-800"
            )}
            title={session.title || "Untitled"}
          >
            <MessageSquare className="h-4 w-4 text-zinc-500" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-zinc-800 bg-[#161616] flex flex-col">
      <div className="p-3 border-b border-zinc-800">
        <h2 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          {isSearching ? "Search Results" : "Sessions"}
        </h2>
        <p className="text-xs text-zinc-600 mt-1">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {isSearching ? (
          <div className="space-y-0.5 px-2">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isSelected={selectedSessionId === session.id}
                onClick={() => onSelectSession(session.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {Object.entries(sessionsByProject).map(([project, projectSessions]) => (
              <div key={project}>
                <button
                  onClick={() => toggleProject(project)}
                  className="w-full flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 transition-transform",
                      expandedProjects.has(project) && "rotate-90"
                    )}
                  />
                  <Folder className="h-3 w-3" />
                  <span className="truncate flex-1 text-left">{project}</span>
                  <span className="text-zinc-600">{projectSessions.length}</span>
                </button>
                {expandedProjects.has(project) && (
                  <div className="ml-4 space-y-0.5 px-2">
                    {projectSessions.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        isSelected={selectedSessionId === session.id}
                        onClick={() => onSelectSession(session.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {sessions.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            {isSearching ? "No sessions found" : "No sessions yet"}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionItem({
  session,
  isSelected,
  onClick,
}: {
  session: Session;
  isSelected: boolean;
  onClick: () => void;
}) {
  const timeAgo = getTimeAgo(new Date(session.updated).getTime());

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-2 rounded-md hover:bg-zinc-800 transition-colors",
        isSelected && "bg-zinc-800"
      )}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className="h-4 w-4 text-zinc-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-zinc-200">
            {session.title || "Untitled Session"}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              {(session.totalTokens / 1000).toFixed(1)}k
            </span>
            {session.isPublic ? (
              <span title="Public"><Globe className="h-3 w-3 text-emerald-500" /></span>
            ) : (
              <span title="Private"><Lock className="h-3 w-3" /></span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(timestamp).toLocaleDateString();
}
