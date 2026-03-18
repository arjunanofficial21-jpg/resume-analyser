import { Plus } from 'lucide-react';

export default function DropOverlay({ isVisible }) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none transition-all duration-500">
      {/* Heavy crystal-clear blur */}
      <div className="absolute inset-0 bg-base/40 backdrop-blur-[12px] animate-in fade-in duration-500" />
      
      <div className="relative flex flex-col items-center gap-6 animate-in zoom-in-95 fade-in duration-500 delay-100">
        {/* Large Centered Icon — matches the ChatGPT 'Add anything' vibe */}
        <div className="w-24 h-24 rounded-[2rem] bg-accent/15 border border-accent/20 flex items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent animate-pulse" />
          {/* Blue Plus Icon — common for "add anything" */}
          <div className="relative w-12 h-12 rounded-xl bg-accent flex items-center justify-center shadow-2xl shadow-accent/40">
            <Plus size={28} className="text-white font-bold" />
          </div>
        </div>
        
        <div className="text-center">
          <h3 className="text-3xl font-semibold text-foreground tracking-tight">Add anything</h3>
          <p className="text-muted text-lg mt-2">Drop resumes here to add them to the conversation</p>
        </div>
      </div>
      
      {/* Subtle border Glow */}
      <div className="absolute inset-8 rounded-[3rem] border border-accent/10 pointer-events-none shadow-[inset_0_0_100px_rgba(139,92,246,0.05)]" />
    </div>
  );
}
