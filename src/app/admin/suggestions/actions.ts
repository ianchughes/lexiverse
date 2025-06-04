
'use server';

import { firestore } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { UserSuggestionStatus } from '@/types';
import { logAdminAction } from '@/lib/auditLogger';

interface AdminUpdateSuggestionStatusPayload {
  suggestionId: string;
  newStatus: UserSuggestionStatus;
  adminNotes?: string;
  actingAdminId: string;
}

export async function adminUpdateSuggestionStatusAction(payload: AdminUpdateSuggestionStatusPayload): Promise<{ success: boolean; error?: string }> {
  const { suggestionId, newStatus, adminNotes, actingAdminId } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Admin authentication required." };
  }
  if (!suggestionId) {
    return { success: false, error: "Suggestion ID is required." };
  }

  try {
    const suggestionDocRef = doc(firestore, 'UserSuggestions', suggestionId);
    const updateData: any = {
      status: newStatus,
      actionedByAdminId: actingAdminId,
      dateActioned: serverTimestamp(),
    };
    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }

    await updateDoc(suggestionDocRef, updateData);

    await logAdminAction({
      actingAdminId,
      actionType: newStatus === 'Actioned' ? 'SUGGESTION_ACTIONED' : 'SUGGESTION_ARCHIVED_NO_ACTION',
      targetEntityType: 'Suggestion',
      targetEntityId: suggestionId,
      details: `Suggestion status updated to ${newStatus}. Notes: ${adminNotes || 'N/A'}`,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error updating suggestion status:", error);
    return { success: false, error: error.message || "Failed to update suggestion status." };
  }
}

    