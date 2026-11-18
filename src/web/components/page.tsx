import type { ReactNode } from "react";

/** Page frame: gradient title, optional actions on the right, then content. */
export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
          {title}
        </h1>
        {actions}
      </header>
      {children}
    </div>
  );
}
