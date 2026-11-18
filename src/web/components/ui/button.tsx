import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const VARIANTS = {
  primary: "bg-foreground text-background hover:-translate-y-px hover:shadow-lg",
  secondary: "border border-border-strong bg-elevated text-foreground hover:bg-card-hover",
  ghost: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS };

export function Button({ variant = "secondary", className, ...props }: Props) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition duration-200 disabled:pointer-events-none disabled:opacity-50 md:min-h-9",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
