import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Search, PanelLeft, FileText, Settings, LogOut, User, Command } from "lucide-react";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onToggleSidebar: () => void;
}

export const Header = forwardRef<HTMLInputElement, HeaderProps>(
  function Header({ searchQuery, onSearchChange, onToggleSidebar }, ref) {
    const { user, signOut } = useAuth();

    return (
      <header className="h-12 border-b border-zinc-800 bg-[#161616] flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="relative group">
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            {/* Tooltip with keyboard shortcut */}
            <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              Toggle Sidebar
              <span className="ml-2 text-zinc-500">
                <Command className="h-3 w-3 inline" /> .
              </span>
            </div>
          </div>
          <Link to="/" className="font-medium text-zinc-200 text-sm">
            opensync
          </Link>
        </div>

        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              ref={ref}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search sessions..."
              className="w-full h-8 pl-9 pr-16 rounded-md bg-[#0E0E0E] border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
            />
            {/* Keyboard shortcut hint */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-zinc-600 pointer-events-none">
              <Command className="h-3 w-3" />
              <span className="text-xs">K</span>
            </div>
          </div>
        </div>

      <div className="flex items-center gap-1">
        <Link
          to="/docs"
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          title="Documentation"
        >
          <FileText className="h-4 w-4" />
        </Link>
        <Link
          to="/settings"
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>

        <div className="relative group">
          <button className="flex items-center gap-2 p-1.5 rounded hover:bg-zinc-800">
            {user?.profilePictureUrl ? (
              <img
                src={user.profilePictureUrl}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center">
                <User className="h-3 w-3 text-zinc-300" />
              </div>
            )}
          </button>

          <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-[#161616] border border-zinc-800 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <div className="px-3 py-2 border-b border-zinc-800">
              <p className="text-sm font-medium text-zinc-200">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-zinc-500">{user?.email}</p>
            </div>
            <Link
              to="/settings"
              className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 w-full text-left text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
});
