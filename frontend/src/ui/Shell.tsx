import type { ReactNode } from "react";

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      <main className="container-narrow py-6">
        {children}
      </main>
      <footer className="mt-12 border-t border-border">
        <div className="container-narrow py-4 text-xs text-[hsl(215_16.3%_46.9%)] dark:text-white/60">
          Built with React + Tailwind + LangGraph
        </div>
      </footer>
    </div>
  );
}
