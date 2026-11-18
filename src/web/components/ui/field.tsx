import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const control =
  "w-full rounded-lg border border-border-strong bg-background-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none aria-invalid:border-danger/70 disabled:opacity-50";

/** A labelled form control with an optional hint and error message. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

const describedBy = (id: string | undefined, invalid: boolean) => (invalid && id ? `${id}-error` : undefined);

type Invalid = { invalid?: boolean };

export function Input({ className, invalid = false, ...props }: InputHTMLAttributes<HTMLInputElement> & Invalid) {
  return (
    <input
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(props.id, invalid)}
      className={cn(control, "min-h-11 md:min-h-9", className)}
      {...props}
    />
  );
}

export function Select({ className, invalid = false, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Invalid) {
  return (
    <select
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(props.id, invalid)}
      className={cn(control, "min-h-11 md:min-h-9", className)}
      {...props}
    />
  );
}

export function Textarea({ className, invalid = false, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(props.id, invalid)}
      className={cn(control, "min-h-24 py-2", className)}
      {...props}
    />
  );
}
