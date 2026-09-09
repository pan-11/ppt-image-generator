import { useEffect, useRef, type ReactNode } from "react";

export function ModalDialog(props: {
  open: boolean;
  label: string;
  id?: string;
  placement?: "center" | "right";
  className?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    const initialFocus = dialog.querySelector<HTMLElement>("[data-modal-initial-focus]");
    initialFocus?.focus();

    return () => {
      if (typeof dialog.close === "function" && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      trigger?.focus();
    };
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      id={props.id}
      className={`modal-dialog${props.placement === "right" ? " modal-dialog-right" : ""}`}
      aria-label={props.label}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div className={`modal-card${props.className ? ` ${props.className}` : ""}`}>
        {props.children}
      </div>
    </dialog>
  );
}
