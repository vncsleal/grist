import React from "react";
import { Button, Skeleton } from "@heroui/react";

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

export function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-16 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-[30px] h-[30px] rounded-md" />
            <Skeleton className="h-4 w-20 rounded-lg" />
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-8 w-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </nav>
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-96 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
