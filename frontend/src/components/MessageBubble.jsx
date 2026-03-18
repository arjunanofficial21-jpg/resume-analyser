import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Copy, Check, FileText, Pencil, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TypingIndicator from './TypingIndicator';

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).catch(() => { });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      aria-label={copied ? 'Copied!' : 'Copy message'}
      className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-white/[0.08] transition-all"
    >
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

export default function MessageBubble({ message, isStreaming = false, onEdit }) {
  const { role, text, files } = message;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(text || '');
  const textareaRef = useRef(null);

  // Focus textarea when edit mode opens
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== text) {
      onEdit?.(message.id, trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setDraft(text || '');
      setEditing(false);
    }
  };

  // ── PDF upload card(s) ───────────────────────────────────────
  if (role === 'files') {
    return (
      <div className="flex items-start justify-end gap-3 px-4 py-3 w-full max-w-3xl mx-auto">
        <div className="flex flex-col gap-2">
          {(files || []).map((f) => (
            <div
              key={f.name}
              className="flex items-center gap-3 bg-elevated border border-divider rounded-2xl rounded-tr-sm px-4 py-3 min-w-[200px] max-w-[280px]"
            >
              <div className="shrink-0 w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                <FileText size={16} className="text-white" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs md:text-sm text-foreground font-medium truncate leading-snug">{f.name}</span>
                <span className="text-[10px] md:text-xs text-muted uppercase tracking-wider mt-0.5">PDF</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── User message ─────────────────────────────────────────────
  if (role === 'user') {
    return (
      <div className="group flex flex-col items-end px-4 py-3 w-full max-w-3xl mx-auto">
        {editing ? (
          /* ── Edit mode ── */
          <div className="w-full max-w-[70%] flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className="w-full px-4 py-3 rounded-2xl bg-elevated border border-accent/50 text-foreground text-xs md:text-sm leading-relaxed resize-none outline-none focus:border-accent transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDraft(text || ''); setEditing(false); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-white/[0.06] transition-all"
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 transition-all"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <div className="max-w-[70%] px-4 py-3 rounded-2xl bg-elevated border border-divider text-foreground text-xs md:text-sm leading-relaxed whitespace-pre-wrap break-words">
            {text}
          </div>
        )}

        {/* Action buttons — bottom-right, on hover */}
        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
            <button
              onClick={() => { setDraft(text || ''); setEditing(true); }}
              aria-label="Edit message"
              className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-white/[0.08] transition-all"
            >
              <Pencil size={13} />
            </button>
            <CopyBtn text={text} />
          </div>
        )}
      </div>
    );
  }

  // ── Error message ────────────────────────────────────────────
  if (role === 'error') {
    return (
      <div className="flex gap-4 px-4 py-4 w-full max-w-3xl mx-auto">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500/10 border border-red-500/20 shrink-0 mt-0.5">
          <AlertCircle size={14} className="text-red-400" />
        </div>
        <p className="text-xs md:text-sm text-red-400 leading-relaxed pt-1 flex-1">{text}</p>
      </div>
    );
  }

  // ── AI message ───────────────────────────────────────────────
  return (
    <div className="px-4 py-4 w-full max-w-3xl mx-auto min-w-0 overflow-hidden">
      <div className="min-w-0 overflow-hidden">
        {isStreaming && !text ? (
          <TypingIndicator />
        ) : (
          <div className="text-xs md:text-sm text-foreground markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {(text || '') + (isStreaming ? '▍' : '')}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {/* Copy button — bottom-left, always shown */}
      {!isStreaming && text && (
        <div className="flex justify-start mt-1">
          <CopyBtn text={text} />
        </div>
      )}
    </div>
  );
}
