import { useState, useRef, useEffect } from 'react';
import { Plus, MessageSquare, Trash2, Bot, LogOut, LogIn, Pencil, Check, X, SquarePen, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Sidebar icons ────────────────────────────────────────────────
const SidebarCollapseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="5" height="18" rx="1.5" fill="currentColor" opacity="0.9" />
    <rect x="10" y="7" width="11" height="2" rx="1" fill="currentColor" opacity="0.5" />
    <rect x="10" y="11" width="8" height="2" rx="1" fill="currentColor" opacity="0.5" />
    <rect x="10" y="15" width="9" height="2" rx="1" fill="currentColor" opacity="0.5" />
  </svg>
);

const SidebarExpandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="5" height="18" rx="1.5" fill="currentColor" opacity="0.9" />
    <rect x="10" y="7" width="11" height="2" rx="1" fill="currentColor" opacity="0.5" />
    <rect x="10" y="11" width="8" height="2" rx="1" fill="currentColor" opacity="0.5" />
    <rect x="10" y="15" width="9" height="2" rx="1" fill="currentColor" opacity="0.5" />
  </svg>
);

// ── Date grouping helper ─────────────────────────────────────────
function getDateGroup(date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'This Week';
  if (diffDays <= 30) return 'This Month';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];

function groupConversations(conversations) {
  const groups = {};
  for (const conv of conversations) {
    const g = getDateGroup(conv.createdAt);
    if (!groups[g]) groups[g] = [];
    groups[g].push(conv);
  }
  return GROUP_ORDER.filter(g => groups[g]).map(g => ({ label: g, items: groups[g] }));
}

// ── Single conversation item ─────────────────────────────────────
function ConversationItem({ conv, isActive, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) {
      setDraft(conv.title);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, conv.title]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(conv.title);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-elevated">
        <MessageSquare size={14} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          className="flex-1 text-xs md:text-sm bg-transparent outline-none text-foreground min-w-0"
        />
        <button onClick={commit} className="p-1 rounded text-accent hover:text-accent/80 shrink-0">
          <Check size={12} />
        </button>
        <button onClick={cancel} className="p-1 rounded text-muted hover:text-red-400 shrink-0">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(conv.id)}
      onClick={() => onSelect(conv.id)}
      className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive
        ? 'bg-elevated text-foreground'
        : 'text-muted hover:bg-white/[0.05] hover:text-foreground'
        }`}
    >
      <MessageSquare size={14} className="shrink-0 flex-none" />
      <span className="flex-1 text-xs md:text-sm truncate min-w-0">{conv.title}</span>

      {/* File count badge */}
      {conv.fileCount > 0 && (
        <span
          className="shrink-0 flex items-center gap-0.5 text-[9px] font-semibold text-accent/70 bg-accent/10 border border-accent/20 rounded-full px-1.5 py-0.5 leading-none group-hover:opacity-0 transition-opacity"
          title={`${conv.fileCount} PDF${conv.fileCount > 1 ? 's' : ''} uploaded`}
        >
          <FileText size={8} />
          {conv.fileCount}
        </span>
      )}

      {/* Action buttons (appear on hover) */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          aria-label="Rename conversation"
          className="p-1 rounded hover:text-accent text-muted transition-all"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
          aria-label="Delete conversation"
          className="p-1 rounded hover:text-red-400 text-muted transition-all"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────
export default function Sidebar({
  isOpen,
  onToggle,
  conversations,
  currentConvId,
  onNewChat,
  onSelect,
  onDelete,
  onRename,
  onSignInClick,
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const grouped = groupConversations(conversations);

  return (
    <aside
      className={`absolute z-30 h-full md:relative flex flex-col shrink-0 bg-panel border-r border-divider transition-all duration-300 ease-in-out overflow-hidden shadow-2xl md:shadow-none ${isOpen ? 'w-64' : 'w-12'
        }`}
    >
      {/* Toggle button row */}
      <div className="flex items-center h-14 px-2 shrink-0 border-b border-divider">
        {isOpen && (
          <span className="text-sm font-semibold text-foreground tracking-tight ml-1">
            PDF Analysis
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isOpen ? 'Collapse' : 'Expand'}
          className="ml-auto shrink-0 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-white/[0.06] transition-colors"
        >
          {isOpen ? <SidebarCollapseIcon /> : <SidebarExpandIcon />}
        </button>
      </div>

      {/* Collapsed: New Chat icon */}
      {!isOpen && (
        <button
          onClick={onNewChat}
          aria-label="New chat"
          title="New chat"
          className="mx-auto mt-3 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-white/[0.06] transition-colors"
        >
          <SquarePen size={15} />
        </button>
      )}

      {/* Expanded body */}
      {isOpen && (
        <div className="flex flex-col flex-1 overflow-hidden p-3">
          {/* New Chat */}
          <button
            onClick={onNewChat}
            className="flex items-center gap-2 px-3 py-2.5 mb-4 rounded-lg border border-divider text-muted hover:text-foreground hover:bg-white/[0.05] hover:border-accent/30 text-xs md:text-sm transition-all"
          >
            <Plus size={15} />
            New chat
          </button>

          {/* Conversation list grouped by date */}
          <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
            {grouped.length > 0 ? (
              grouped.map(({ label, items }) => (
                <div key={label}>
                  <p className="text-[10px] md:text-[11px] font-semibold text-muted uppercase tracking-wider px-2 pb-1.5">
                    {label}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conv={conv}
                        isActive={conv.id === currentConvId}
                        onSelect={onSelect}
                        onDelete={onDelete}
                        onRename={onRename}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] md:text-xs text-muted text-center mt-10 leading-relaxed px-4">
                No conversations yet.
                <br />
                Start a new chat!
              </p>
            )}
          </div>

          {/* User section */}
          <div className="border-t border-divider pt-3 mt-3 relative" ref={menuRef}>
            {user ? (
              <>
                {menuOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-panel border border-divider rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-divider">
                      <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-accent">
                          {user.name?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-foreground truncate">{user.name}</span>
                        {user.email && (
                          <span className="text-[10px] text-muted truncate">{user.email}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <LogOut size={13} />
                      Sign out
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-semibold text-accent">
                      {user.name?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <span className="flex-1 text-xs text-foreground truncate text-left">{user.name}</span>
                </button>
              </>
            ) : (
              <button
                onClick={onSignInClick}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted hover:text-foreground hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-divider flex items-center justify-center shrink-0">
                  <LogIn size={13} />
                </div>
                <span className="text-xs">Sign in</span>
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
