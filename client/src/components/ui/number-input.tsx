import * as React from "react";
import { Input } from "@/components/ui/input";

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
  fallback?: number;
  optional?: boolean;
  integer?: boolean;
}

function toStr(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      fallback = 0,
      optional = false,
      integer = true,
      min,
      max,
      onBlur,
      onFocus,
      ...props
    },
    ref
  ) => {
    const parse = (s: string): number | undefined => {
      const n = integer ? parseInt(s, 10) : parseFloat(s);
      return Number.isFinite(n) ? n : undefined;
    };

    const clamp = (n: number): number => {
      let v = n;
      if (min !== undefined && v < (min as number)) v = min as number;
      if (max !== undefined && v > (max as number)) v = max as number;
      return v;
    };

    const [draft, setDraft] = React.useState(toStr(value));
    const focused = React.useRef(false);

    React.useEffect(() => {
      if (!focused.current) {
        setDraft(toStr(value));
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDraft(raw);
      const n = parse(raw);
      if (n !== undefined) {
        onChange(n);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      focused.current = false;
      const raw = draft.trim();
      const n = parse(raw);
      if (n !== undefined) {
        const clamped = clamp(n);
        onChange(clamped);
        setDraft(String(clamped));
      } else {
        if (optional) {
          onChange(undefined);
          setDraft("");
        } else {
          onChange(fallback);
          setDraft(toStr(fallback));
        }
      }
      onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      focused.current = true;
      onFocus?.(e);
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";
