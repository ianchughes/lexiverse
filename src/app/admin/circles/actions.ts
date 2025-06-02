
'use server';

import { firestore } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import type { CircleStatus, Circle } from '@/types';

interface AdminUpdateCircleStatusPayload {
  circleId: string;
  newStatus: CircleStatus;
  // adminUserId: string; // For audit logging
}

export async function adminUpdateCircleStatusAction(payload: AdminUpdateCircleStatusPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const circleRef = doc(firestore, 'Circles', payload.circleId);
    const circleSnap = await getDoc(circleRef);

    if (!circleSnap.exists()) {
      return { success: false, error: "Circle not found." };
    }
    // Add permission checks here if only certain admin roles can perform this
    
    await updateDoc(circleRef, {
      status: payload.newStatus,
      // lastAdminActionTimestamp: serverTimestamp(),
      // lastAdminActionBy: payload.adminUserId, 
    });

    if (payload.newStatus === 'Barred_NameIssue') {
      const circleData = circleSnap.data() as Circle;
      // TODO: Send notification to circleData.creatorUserID
      // Example: createNotification(circleData.creatorUserID, `Your circle "${circleData.circleName}" has been barred due to its name. Please rename it.`);
      console.log(`Circle ${payload.circleId} barred. TODO: Notify creator ${circleData.creatorUserID}`);
    }


    return { success: true };

  } catch (error: any) {
    console.error("Error in adminUpdateCircleStatusAction:", error);
    return { success: false, error: error.message || "Failed to update circle status." };
  }
}

// Add other admin-specific circle actions here:
// - adminAmendCircleDetailsAction (more comprehensive edits than user-facing)
// - adminDeleteCircleAction (hard delete or different status)
// - adminManageCircleMemberAction (remove user, change role)

