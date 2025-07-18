'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';

// Swipe to clear word
export function useSwipeGesture(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStart.current) return;

    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const deltaX = touchEnd.x - touchStart.current.x;
    const deltaY = touchEnd.y - touchStart.current.y;

    // Check if horizontal swipe and it's significant
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        onSwipeRight();
      } else {
        onSwipeLeft();
      }
    }

    touchStart.current = null;
  }, [onSwipeLeft, onSwipeRight]);

  return { swipeHandlers: { handleTouchStart, handleTouchEnd } };
}

// Orientation lock suggestion - ONLY show on actual mobile devices
export function OrientationWarning() {
  const [shouldShowWarning, setShouldShowWarning] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkOrientation = () => {
      // First check if this is actually a mobile device
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 768;
      
      // Only proceed if this is likely a mobile device
      const isMobileDevice = (isTouchDevice || isMobileUserAgent) && isSmallScreen;
      
      if (!isMobileDevice) {
        setShouldShowWarning(false);
        return;
      }

      // Now check orientation - only for mobile devices
      let isLandscape = false;
      if (window.screen.orientation) {
        isLandscape = window.screen.orientation.type.startsWith('landscape');
      } else {
        // Fallback for older browsers
        isLandscape = window.innerWidth > window.innerHeight;
      }

      setShouldShowWarning(isLandscape);
    };

    checkOrientation();
    window.addEventListener('orientationchange', checkOrientation);
    window.addEventListener('resize', checkOrientation);

    return () => {
      window.removeEventListener('orientationchange', checkOrientation);
      window.removeEventListener('resize', checkOrientation);
    };
  }, []);

  if (!shouldShowWarning) return null;

  return (
    <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-4">
      <Card className="max-w-sm">
        <CardContent className="text-center py-8">
          <motion.div
            animate={{ rotate: 90 }}
            transition={{ repeat: Infinity, duration: 2, repeatType: "reverse", ease: "easeInOut" }}
            className="text-6xl mb-4"
          >
            📱
          </motion.div>
          <h3 className="text-xl font-bold mb-2">Rotate Your Device</h3>
          <p className="text-muted-foreground">
            LexiVerse works best in portrait mode on mobile devices.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}