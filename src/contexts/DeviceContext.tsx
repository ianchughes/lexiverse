'use client';

import React, { createContext, useContext } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface DeviceContextType {
  isMobile: boolean;
  isTablet: boolean;
  isTouchDevice: boolean;
  isDesktop: boolean;
}

const DeviceContext = createContext<DeviceContextType>({
  isMobile: false,
  isTablet: false,
  isTouchDevice: false,
  isDesktop: true,
});

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const deviceInfo = useIsMobile();
  
  return (
    <DeviceContext.Provider value={deviceInfo}>
      {children}
    </DeviceContext.Provider>
  );
}

export const useDevice = () => useContext(DeviceContext);
