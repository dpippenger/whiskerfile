import { Cat, PanelLeftClose, PanelLeftOpen, PawPrint, Settings } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useMe } from "../lib/queries";
import { cn } from "../lib/utils";

const NAV = [
  { href: "/", label: "Pets", icon: PawPrint, section: /^\/(pets(\/|$)|$)/ },
  { href: "/settings", label: "Settings", icon: Settings, section: /^\/settings(\/|$)/ },
];

const RAIL_KEY = "whiskerfile.sidebar.rail";

function readRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sidebar on desktop, top bar plus bottom tabs on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const [rail, setRail] = useState(readRail);
  const me = useMe();
  const [location] = useLocation();

  const toggleRail = () => {
    setRail((value) => {
      try {
        localStorage.setItem(RAIL_KEY, value ? "0" : "1");
      } catch {
        // Storage can be unavailable; the preference just won't persist.
      }
      return !value;
    });
  };

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-background-secondary p-3 transition-[width] duration-200 md:flex",
          rail ? "w-[68px]" : "w-60",
        )}
      >
        <div className="flex h-11 items-center gap-2 px-2.5">
          <Cat className="size-5 shrink-0 text-primary" aria-hidden />
          {!rail && <span className="text-base font-bold tracking-tight">Whiskerfile</span>}
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon, section }) => (
            <Link
              key={href}
              href={href}
              title={rail ? label : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-white/60 transition duration-200 hover:bg-white/5 hover:text-foreground",
                section.test(location) && "border-white/10 bg-white/10 text-foreground",
              )}
              aria-current={section.test(location) ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!rail && label}
            </Link>
          ))}
        </nav>
        {!rail && me.data && <p className="truncate px-3 pb-2 text-xs text-muted-foreground">{me.data.email}</p>}
        <button
          type="button"
          onClick={toggleRail}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          className="flex min-h-9 items-center gap-3 rounded-lg px-3 text-muted-foreground transition duration-200 hover:bg-white/5 hover:text-foreground"
        >
          {rail ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          {!rail && <span className="text-xs">Collapse</span>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b border-border px-4 md:hidden">
          <Cat className="size-5 text-primary" aria-hidden />
          <span className="text-base font-bold tracking-tight">Whiskerfile</span>
        </header>
        <main className="@container/main min-w-0 flex-1 p-4 pb-24 md:p-6 md:pb-6 lg:p-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-border bg-background-secondary pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ href, label, icon: Icon, section }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs text-white/60",
              section.test(location) && "text-primary",
            )}
            aria-current={section.test(location) ? "page" : undefined}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
