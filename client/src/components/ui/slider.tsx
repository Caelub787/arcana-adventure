import * as React from "react"

import { cn } from "@/lib/utils"

interface SliderProps {
  className?: string;
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  name?: string;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, value, defaultValue, onValueChange, onValueCommit, min = 0, max = 100, step = 1, disabled, name, ...props }, ref) => {
    const currentValue = value?.[0] ?? defaultValue?.[0] ?? min;
    const percentage = ((currentValue - min) / (max - min)) * 100;

    return (
      <div
        ref={ref}
        className={cn("relative flex w-full touch-none select-none items-center", className)}
        {...props}
      >
        <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
          <div
            className="absolute h-full bg-primary"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          disabled={disabled}
          name={name}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value);
            onValueChange?.([newValue]);
          }}
          onMouseUp={(e) => {
            const newValue = parseFloat((e.target as HTMLInputElement).value);
            onValueCommit?.([newValue]);
          }}
          onTouchEnd={(e) => {
            const newValue = parseFloat((e.target as HTMLInputElement).value);
            onValueCommit?.([newValue]);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:pointer-events-none disabled:opacity-50"
          style={{ margin: 0 }}
        />
        <div
          className="absolute block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors pointer-events-none"
          style={{
            left: `calc(${percentage}% - 8px)`,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider"

export { Slider }
