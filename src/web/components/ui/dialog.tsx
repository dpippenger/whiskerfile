import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal built on the native <dialog>: focus trapping, Escape and the
 * backdrop come from the browser. Full-screen on phones, centred on wider
 * screens. A click on the backdrop closes it only when `dismissible`, so a
 * stray click never throws away a half-filled form.
 */
export function Dialog({
  open,
  onClose,
  title,
  dismissible = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // Only a click on the backdrop closes it; the keyboard closes a dialog natively (Escape).
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => dismissible && e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className="m-auto h-fit max-h-[85dvh] w-full max-w-lg rounded-xl border border-border-strong bg-elevated p-0 text-foreground backdrop:bg-black/70 max-md:m-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:border-0"
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col max-md:h-full">
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 md:px-6">
            <h2 id="dialog-title" className="text-base font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground md:size-9"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}
