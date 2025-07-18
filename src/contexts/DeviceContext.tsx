
'use client';

import React, { createContext, useContext } from 'react';
import { useIsMobile } from '@/hooks/use-mobile'; // Corrected import

interface DeviceContextType {
  isMobile: boolean;
  isTablet: boolean; // Kept for type consistency, will default to false
  isTouchDevice: boolean; // Kept for type consistency
  isDesktop: boolean; // Kept for type consistency
}

const DeviceContext = createContext<DeviceContextType>({
  isMobile: false,
  isTablet: false,
  isTouchDevice: false,
  isDesktop: true,
});

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  
  // Basic touch detection that can run on the client
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const deviceInfo = {
    isMobile,
    isTablet: false, // Placeholder, can be expanded later
    isTouchDevice,
    isDesktop: !isMobile && !false, // Placeholder for tablet
  };
  
  return (
    <DeviceContext.Provider value={deviceInfo}>
      {children}
    </DeviceContext.Provider>
  );
}

export const useDevice = () => useContext(DeviceContext);
