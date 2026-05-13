/**
 * Lightweight UI primitives for @arcana/library-dialogs.
 *
 * No Tailwind, no shadcn, no Radix at consume time. Each primitive
 * styles itself from CSS custom properties declared in `theme.css`,
 * so partners re-skin everything by overriding `--ld-*` variables on
 * a single root element.
 */
import * as React from "react";
import { cn } from "../lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/* ---------- Button ---------- */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "ghost" | "danger" | "outline";
  size?: "default" | "sm" | "icon";
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", className, type, ...rest }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn("ld-btn", className)}
      data-variant={variant}
      data-size={size}
      {...rest}
    />
  )
);
Button.displayName = "Button";

/* ---------- Input ---------- */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn("ld-input", className)} {...rest} />
  )
);
Input.displayName = "Input";

/* ---------- Textarea ---------- */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea ref={ref} className={cn("ld-textarea", className)} {...rest} />
  )
);
Textarea.displayName = "Textarea";

/* ---------- Label ---------- */
export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}
export const Label: React.FC<LabelProps> = ({ className, required, children, ...rest }) => (
  <label className={cn("ld-label", className)} data-required={required ? "true" : undefined} {...rest}>
    {children}
  </label>
);

/* ---------- Checkbox ---------- */
export interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "data-testid"?: string;
}
export const Checkbox: React.FC<CheckboxProps> = ({ checked, onCheckedChange, ...rest }) => (
  <input
    type="checkbox"
    className={cn("ld-checkbox", rest.className)}
    checked={!!checked}
    onChange={(e) => onCheckedChange?.(e.target.checked)}
    disabled={rest.disabled}
    id={rest.id}
    data-testid={rest["data-testid"]}
  />
);

/* ---------- Select (native) ----------
   We use a styled <select> rather than Radix to keep zero peer deps.
   API matches the parts of Radix's <Select> that the dialogs use:
   `value`, `onValueChange`, child <option>s. */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value?: string;
  onValueChange?: (value: string) => void;
}
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ value, onValueChange, className, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn("ld-select-trigger", className)}
      value={value ?? ""}
      onChange={(e) => onValueChange?.(e.target.value)}
      {...rest}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

/* Convenience wrappers so callsites can read like Radix without depending on it. */
export const SelectItem: React.FC<{ value: string; children: React.ReactNode; disabled?: boolean }> = ({ value, children, disabled }) => (
  <option value={value} disabled={disabled}>{children}</option>
);

/* ---------- Section / panel / row helpers ---------- */
export const Stack: React.FC<DivProps & { gap?: "sm" | "md" }> = ({ gap = "md", className, ...rest }) => (
  <div className={cn(gap === "sm" ? "ld-stack-sm" : "ld-stack", className)} {...rest} />
);
export const Row: React.FC<DivProps> = ({ className, ...rest }) => (
  <div className={cn("ld-row", className)} {...rest} />
);
export const Grid2: React.FC<DivProps> = ({ className, ...rest }) => (
  <div className={cn("ld-grid-2", className)} {...rest} />
);
export const Grid3: React.FC<DivProps> = ({ className, ...rest }) => (
  <div className={cn("ld-grid-3", className)} {...rest} />
);
export const Section: React.FC<DivProps & { title?: React.ReactNode }> = ({ title, className, children, ...rest }) => (
  <div className={cn("ld-section", className)} {...rest}>
    {title && <div className="ld-section-title">{title}</div>}
    {children}
  </div>
);
export const Panel: React.FC<DivProps> = ({ className, ...rest }) => (
  <div className={cn("ld-panel", className)} {...rest} />
);
export const Badge: React.FC<DivProps & { tone?: "default" | "accent" | "violet" | "muted" }> = ({ tone = "default", className, ...rest }) => (
  <span className={cn("ld-badge", className)} data-tone={tone} {...rest} />
);
