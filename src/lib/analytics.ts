'use client';

import { analytics } from '@/lib/firebase';
import { logEvent } from 'firebase/analytics';

/**
 * Tracks a custom event with Firebase Analytics.
 * @param eventName The name of the event to track.
 * @param properties An optional object of key-value pairs for event parameters.
 */
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (analytics) {
    logEvent(analytics, eventName, properties);
  } else {
    // This can happen if Firebase Analytics is not supported or still initializing.
    // In a production environment, you might want to queue these events.
    console.log(`Analytics not ready. Event not tracked: ${eventName}`, properties);
  }
};
