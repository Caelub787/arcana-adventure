import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Is this the phone layout?
 *
 * A width of 0 is not an answer. iOS drops a home-screen app that has been in
 * the background and relaunches it when you come back, and for a frame or two
 * of that relaunch window.innerWidth reads 0. Nothing is 0 wide, so that is
 * the browser saying "not yet", not "phone" — taking it at face value is how
 * a tablet came back from the background as a phone.
 */
function read(prev: boolean): boolean {
  const w = typeof window === "undefined" ? 0 : window.innerWidth
  return w ? w < MOBILE_BREAKPOINT : prev
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => read(false))

  React.useEffect(() => {
    let live = true
    const check = () => { if (live) setIsMobile(read) }
    // The media query on its own can't put this right again. It only fires on
    // the way past the breakpoint, so once a bad reading is in, no event ever
    // comes to correct it and the wrong layout sticks until the app is opened
    // fresh. Coming back to the app is the moment it goes wrong, so watch for
    // that as well, and look again after it has had a moment to settle.
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const frames: number[] = []
    const timers: number[] = []
    const settle = () => {
      check()
      frames.push(requestAnimationFrame(check))
      timers.push(window.setTimeout(check, 300))
    }
    mql.addEventListener("change", check)
    window.addEventListener("resize", check)
    window.addEventListener("orientationchange", settle)
    window.addEventListener("pageshow", settle)
    document.addEventListener("visibilitychange", settle)
    settle()
    return () => {
      live = false
      frames.forEach(cancelAnimationFrame)
      timers.forEach(clearTimeout)
      mql.removeEventListener("change", check)
      window.removeEventListener("resize", check)
      window.removeEventListener("orientationchange", settle)
      window.removeEventListener("pageshow", settle)
      document.removeEventListener("visibilitychange", settle)
    }
  }, [])

  return isMobile
}
