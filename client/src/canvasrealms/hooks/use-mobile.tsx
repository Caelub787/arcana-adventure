import * as React from "react"

// Treat anything narrower than 1024px (tablets in portrait and most
// landscape tablets) as "mobile" so the app uses its touch-first
// layout — fullscreen Compass, drawer library, single-pane workspace,
// larger tap targets — instead of the desktop layout, which feels
// cramped and triggers gesture conflicts on tablets.
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
