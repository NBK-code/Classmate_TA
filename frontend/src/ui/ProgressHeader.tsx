import { Sun, Moon, GraduationCap } from "lucide-react";

type Props = {
  level: string;
  questionIndex: number;  // 0-based
  total: number;
  onToggleTheme?: () => void;
};

export default function ProgressHeader({ level, questionIndex, total, onToggleTheme }: Props) {
  const pct = total > 0 ? Math.round(((questionIndex + 1) / total) * 100) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container-narrow flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-black text-white dark:bg-white dark:text-black">
            <GraduationCap size={18} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Teaching Assistant</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge">{level}</span>
          <button className="btn btn-ghost" onClick={onToggleTheme} title="Toggle theme">
            <Sun className="hidden dark:block" size={16} />
            <Moon className="dark:hidden" size={16} />
          </button>
        </div>
      </div>
      <div className="container-narrow pb-3">
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 text-xs text-[hsl(215_16.3%_46.9%)] dark:text-white/60">
          {total ? `Question ${questionIndex + 1} of ${total}` : "Ready"}
        </div>
      </div>
    </header>
  );
}
