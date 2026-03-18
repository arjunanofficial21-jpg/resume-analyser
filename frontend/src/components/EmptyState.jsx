import { FileText, Users, Award, BarChart2 } from 'lucide-react';

const SUGGESTIONS = [
  { icon: Users,    label: 'Who is the best candidate for React JS?' },
  { icon: BarChart2, label: 'Make a table of years of experience per candidate' },
  { icon: Award,    label: 'Which candidates have AWS or cloud certifications?' },
  { icon: FileText, label: 'Summarise all candidates\' key skills' },
];

export default function EmptyState({ onSuggest }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-10 overflow-y-auto">
      {/* Branding */}
      <div className="mb-6 flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20">
        <FileText size={26} className="text-accent" />
      </div>
      <h1 className="text-xl md:text-2xl font-semibold text-foreground mb-2 text-center">
        Resume Analyser
      </h1>
      <p className="text-xs md:text-sm text-muted text-center max-w-sm mb-8">
        Upload one or more resumes and let AI help you find the best candidates — ask anything about skills, experience, or fit.
      </p>

      {/* Suggested questions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
        {SUGGESTIONS.map(({ icon: Icon, label }) => (
          <button
            key={label}
            onClick={() => onSuggest?.(label)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-divider text-left text-xs md:text-sm text-muted hover:text-foreground hover:bg-white/[0.05] hover:border-accent/30 transition-all group"
          >
            <Icon size={14} className="shrink-0 text-accent/60 group-hover:text-accent transition-colors" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <p className="mt-8 text-[10px] md:text-[11px] text-muted/60 text-center">
        Upload a resume with the 📎 button, then start asking hiring questions.
      </p>
    </div>
  );
}
