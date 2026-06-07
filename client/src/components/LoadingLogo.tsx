import { cn } from "@/lib/utils";
import loadingLogo from "@assets/IMG_0029_1780866832907.gif";

interface LoadingLogoProps {
  className?: string;
}

export function LoadingLogo({ className }: LoadingLogoProps) {
  return (
    <img
      src={loadingLogo}
      alt="Loading"
      role="status"
      aria-label="Loading"
      draggable={false}
      className={cn("inline-block object-contain select-none", className)}
    />
  );
}
