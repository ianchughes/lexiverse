
'use server';

import { firestore } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { SystemSettings } from '@/types';
import { logAdminAction } from '@/lib/auditLogger';

const SYSTEM_SETTINGS_COLLECTION = "SystemConfiguration";
const GAME_SETTINGS_DOC_ID = "gameSettings";

interface AdminForceDailyResetPayload {
  actingAdminId: string;
}

export async function adminForceDailyResetAction(payload: AdminForceDailyResetPayload): Promise<{ success: boolean; error?: string }> {
  const { actingAdminId } = payload;
  if (!actingAdminId) {
    return { success: false, error: "Authentication required." };
  }

  try {
    const settingsDocRef = doc(firestore, SYSTEM_SETTINGS_COLLECTION, GAME_SETTINGS_DOC_ID);
    const newSettings: Partial<SystemSettings> = {
      lastForcedResetTimestamp: serverTimestamp() as Timestamp,
    };
    await setDoc(settingsDocRef, newSettings, { merge: true });

    await logAdminAction({
      actingAdminId,
      actionType: 'SYSTEM_DAILY_RESET_TRIGGER',
      details: 'Admin triggered a daily game reset for all users.',
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error forcing daily reset:", error);
    return { success: false, error: error.message || "Could not trigger daily reset." };
  }
}
