
"use client"

import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      setIsMobile(false);
      return;
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Set initial value on component mount
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    
    // Listen for changes
    mql.addEventListener("change", onChange)

    // Cleanup listener on component unmount
    return () => mql.removeEventListener("change", onChange)
  }, [])

  // Return a sensible default during server-side rendering or initial hydration
  return isMobile === undefined ? false : isMobile
}
