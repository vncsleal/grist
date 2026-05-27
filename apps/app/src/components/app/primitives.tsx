import React from "react";

export function DotLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--accent)", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px", padding: 0 }}
    >
      {children}
    </button>
  );
}

export function MonoLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", color: "var(--accent)", opacity: 0.6, padding: 0, transition: "opacity 0.15s" }}
    >
      {children}
    </button>
  );
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-(--background) text-(--foreground)">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-16 border-b border-(--border) bg-(--background)/90 backdrop-blur-xl">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-md bg-(--border) animate-pulse" />
            <div className="h-4 w-20 rounded bg-(--border) animate-pulse" style={{ animationDelay: "50ms" }} />
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="h-8 w-16 rounded-lg bg-(--border) animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-20 rounded-lg bg-(--border) animate-pulse" style={{ animationDelay: "100ms" }} />
          <div className="h-8 w-8 rounded-full bg-(--border) animate-pulse" style={{ animationDelay: "150ms" }} />
        </div>
      </nav>
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="h-8 w-64 rounded-lg bg-(--border) animate-pulse" style={{ animationDelay: "50ms" }} />
          <div className="h-4 w-96 rounded bg-(--border) animate-pulse" style={{ animationDelay: "100ms" }} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-32 rounded-xl bg-(--border) animate-pulse"
                style={{ animationDelay: `${(i + 2) * 50}ms` }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
