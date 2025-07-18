"use client"

import { useState, useEffect } from 'react';

// Define standard breakpoints
const TABLET_BREAKPOINT = 768; // md
const DESKTOP_BREAKPOINT = 1024; // lg

/**
 * A custom hook to detect device characteristics like mobile, tablet, and touch capability.
 * This hook listens to window resize events to provide responsive state to components.
 *
 * @returns An object with boolean flags: `isMobile`, `isTablet`, `isDesktop`, `isTouchDevice`.
 */
export function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // This function can only run on the client where `window` is available
    if (typeof window === 'undefined') {
      return;
    }

    const checkDevice = () => {
      // Check for touch capability
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsTouchDevice(hasTouch);

      // Check viewport width for device type
      const width = window.innerWidth;
      const mobile = width < TABLET_BREAKPOINT;
      const tablet = width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT;
      
      setIsMobile(mobile);
      setIsTablet(tablet);
      setIsDesktop(!mobile && !tablet);
    };

    // Initial check on mount
    checkDevice();

    // Add event listener for window resize
    window.addEventListener('resize', checkDevice);
    
    // Cleanup event listener on component unmount
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return { isMobile, isTablet, isDesktop, isTouchDevice };
}
