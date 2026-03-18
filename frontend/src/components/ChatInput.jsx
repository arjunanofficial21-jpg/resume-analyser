import { useState, useRef, useEffect } from 'react';
import { ArrowRight, Paperclip, Loader2, X, FileText, Square } from 'lucide-react';

export default function ChatInput({ onSend, onUpload, disabled, uploading, uploadProgress, stagedFiles, setStagedFiles, onStop }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // When user picks files — stage them
  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setStagedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...picked.filter((f) => !existing.has(f.name))];
    });
    e.target.value = '';
    if (textareaRef.current) textareaRef.current.focus();
  };

  // ── Paste Handler ──────────────────────────────────────────
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file && file.type === 'application/pdf') files.push(file);
      }
    }
    if (files.length > 0) {
      setStagedFiles((prev) => {
        const existing = new Set(prev.map((f) => f.name));
        return [...prev, ...files.filter((f) => !existing.has(f.name))];
      });
      if (textareaRef.current) textareaRef.current.focus();
    }
  };

  const removeStaged = (name) => {
    setStagedFiles((prev) => prev.filter((f) => f.name !== name));
    if (textareaRef.current) textareaRef.current.focus();
  };

  const submit = () => {
    const hasText = value.trim().length > 0;
    const hasFiles = stagedFiles.length > 0;
    if ((!hasText && !hasFiles) || disabled) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      if (disabled) return; // don't submit while AI is responding
      submit();
    }
  };

  const canSend = (value.trim().length > 0 || stagedFiles.length > 0) && !disabled && !uploading;

  return (
    <div className="shrink-0 px-4 pb-5 pt-3 bg-base border-t border-divider">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-2 bg-elevated border border-divider rounded-2xl px-4 py-3 focus-within:border-accent/40 transition-colors">

          {/* ── Staged PDF chips ─────────────────────────────────── */}
          {stagedFiles.length > 0 && (
            <div className="flex flex-col gap-2">
              {/* File count badge */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">
                  {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''} selected
                </span>
                <button
                  type="button"
                  onClick={() => setStagedFiles([])}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear all
                </button>
              </div>
              {/* Scrollable file list */}
              <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto pr-1">
              {stagedFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center gap-2 bg-white/[0.06] border border-divider rounded-xl px-3 py-2 max-w-[220px] group"
                >
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                    <FileText size={14} className="text-red-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] text-foreground font-medium truncate leading-tight">{file.name}</span>
                    <span className="text-[10px] text-muted uppercase tracking-wider">PDF</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStaged(file.name)}
                    className="shrink-0 ml-1 text-muted hover:text-red-400 transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* ── Upload Progress Indicator ─────────────────────────── */}
          {uploading && uploadProgress?.total > 0 && (
            <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-xl px-3 py-2">
              <Loader2 size={16} className="animate-spin text-accent shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] text-accent font-medium">
                  Uploading {uploadProgress.current} of {uploadProgress.total}
                </span>
                <span className="text-[10px] text-muted truncate">{uploadProgress.fileName}</span>
              </div>
              <div className="shrink-0 text-[10px] text-accent font-medium">
                {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
              </div>
            </div>
          )}

          {/* ── Input row ────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || disabled}
              aria-label="Attach PDF(s)"
              title="Attach PDF(s)"
              className={`shrink-0 p-1 rounded-lg transition-all ${
                uploading
                  ? 'text-accent cursor-wait'
                  : 'text-muted hover:text-accent hover:bg-accent/10 cursor-pointer'
              }`}
            >
              {uploading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Paperclip size={16} />
              )}
            </button>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                stagedFiles.length > 0
                  ? 'Add a message or just press Send to upload document(s)…'
                  : 'Attach a PDF or ask anything…'
              }
              rows={1}
              aria-label="Message input"
              className="flex-1 bg-transparent text-xs md:text-sm text-foreground resize-none outline-none placeholder:text-muted leading-6 min-h-[24px] max-h-[200px] overflow-y-auto self-center"
            />

            {/* Stop button while AI is generating, Send button otherwise */}
            {disabled ? (
              <button
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop"
                className="shrink-0 h-[28px] w-8 flex items-center justify-center rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:text-red-300 transition-all cursor-pointer"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
                className={`shrink-0 h-[28px] flex items-center justify-center w-8 rounded-lg transition-all ${
                  canSend
                    ? 'bg-accent hover:bg-accent/80 text-white cursor-pointer shadow-lg shadow-accent/20'
                    : 'bg-white/[0.06] text-muted cursor-not-allowed'
                }`}
              >
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] md:text-[11px] text-muted mt-2">
          AI can make mistakes. Consider verifying important information.
        </p>
      </div>
    </div>
  );
}

