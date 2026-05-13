/**
 * Default modal chrome used when the host adapter does not provide its
 * own `modal` slot. Pure React + CSS variables — no Radix, no portals,
 * no focus-trap library. Partners are encouraged to swap this out for
 * their own component (e.g. Radix Dialog, side sheet, popout) by
 * passing `host.modal`.
 */
import * as React from "react";
import { Button } from "./primitives";
import type { HostModalProps } from "../types";

export const DefaultModal: React.FC<HostModalProps> = ({
  open, onOpenChange, title, description, children, footer,
}) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div
      className="ld-dialog-overlay"
      data-ld-root
      onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div className="ld-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ld-dialog-header">
          <h2 className="ld-dialog-title">{title}</h2>
          {description && <div className="ld-dialog-desc">{description}</div>}
        </div>
        <div className="ld-dialog-body">{children}</div>
        {footer && <div className="ld-dialog-footer">{footer}</div>}
      </div>
    </div>
  );
};

/** Render whatever modal chrome the host wants. */
export const HostModal: React.FC<HostModalProps & { component?: React.ComponentType<HostModalProps> }> = ({
  component, ...props
}) => {
  const Cmp = component ?? DefaultModal;
  return <Cmp {...props} />;
};

/** Standardized OK/Cancel footer. Used by every dialog. */
export const SaveCancelFooter: React.FC<{
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
}> = ({ onCancel, onSave, saving, saveLabel }) => (
  <>
    <Button variant="outline" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
    <Button variant="primary" onClick={onSave} disabled={saving} data-testid="button-save">
      {saving ? "Saving..." : (saveLabel ?? "Save")}
    </Button>
  </>
);
