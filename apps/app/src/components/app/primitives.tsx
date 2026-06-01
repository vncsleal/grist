import React from "react";
import { Button } from "@heroui/react/button";
import { EmptyState } from "@heroui/react/empty-state";

export function DotLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={onClick}
      className="underline decoration-dotted underline-offset-[3px] p-0 h-auto min-w-0 text-accent"
    >
      {children}
    </Button>
  );
}

export function MonoLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={onClick}
      className="font-mono text-[0.6rem] tracking-wider text-accent/60 hover:opacity-100 p-0 h-auto min-w-0"
    >
      {children}
    </Button>
  );
}

export function InlineAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={onClick}
      className="underline underline-offset-2 decoration-accent/40 h-auto min-w-0 p-0 text-accent hover:decoration-accent transition-all"
    >
      {children}
    </Button>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-xs tracking-widest uppercase text-accent mb-1">
      {children}
    </div>
  );
}

export function PageHeader({ title, description, eyebrow }: { title: string; description?: string; eyebrow?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      {description && (
        <p className="text-sm text-muted leading-relaxed mt-1 max-w-prose">{description}</p>
      )}
    </div>
  );
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-foreground tracking-tight">{title}</h2>
      {description && (
        <p className="text-sm text-muted leading-relaxed">{description}</p>
      )}
    </div>
  );
}

export function PageEmptyState({ icon, message, action }: { icon?: React.ReactNode; message: string; action?: React.ReactNode }) {
  return (
    <EmptyState className="flex h-full flex-col items-center justify-center gap-4 py-16">
      {icon && <div className="text-muted">{icon}</div>}
      <span className="text-sm text-muted">{message}</span>
      {action && <div className="mt-2">{action}</div>}
    </EmptyState>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-accent/10 rounded-lg ${className ?? ""}`} />;
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-16 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="w-[30px] h-[30px] rounded-md" />
            <SkeletonBlock className="h-4 w-20 rounded-lg" />
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <SkeletonBlock key={i} className="h-8 w-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-8 w-20 rounded-lg" />
          <SkeletonBlock className="h-8 w-8 rounded-full" />
        </div>
      </nav>
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <SkeletonBlock className="h-8 w-64 rounded-lg" />
          <SkeletonBlock className="h-4 w-96 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonBlock key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
