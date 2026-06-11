import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const get = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
