import { cn } from "@/lib/utils"
import loadingLogo from "@assets/IMG_0029_1780866832907.gif"

function Spinner({ className, ...props }: React.ComponentProps<"img">) {
  return (
    <img
      src={loadingLogo}
      role="status"
      aria-label="Loading"
      draggable={false}
      className={cn("inline-block size-4 object-contain select-none", className)}
      {...props}
    />
  )
}

export { Spinner }
