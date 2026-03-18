import { FileText } from 'lucide-react';

export default function ChatHeader() {
  return (
    <header className="flex items-center gap-3 h-14 px-4 border-b border-divider shrink-0 bg-base">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-accent" />
        <span className="text-sm font-semibold text-foreground tracking-tight">Resume Analyser</span>
        <span className="hidden sm:inline text-[10px] text-muted border border-divider rounded-full px-2 py-0.5 ml-1">
          Hiring AI
        </span>
      </div>
    </header>
  );
}
