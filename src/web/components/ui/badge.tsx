import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const TONES = {
  neutral: "border-white/10 bg-white/5 text-foreground-secondary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES };

export function Badge({ tone = "neutral", className, ...props }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
