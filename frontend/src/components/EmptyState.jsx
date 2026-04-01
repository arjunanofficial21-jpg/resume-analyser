import { FileText, } from 'lucide-react';



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


      <p className="mt-8 text-sm text-muted/80 text-center max-w-md leading-relaxed">
        Upload a candidate's resume to begin AI-powered analysis. You can then ask targeted questions to evaluate their skills, experience, and fit for the role.
      </p>
    </div>
  );
}
