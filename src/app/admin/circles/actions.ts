
'use server';

import { firestore } from '@/lib/firebase';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import type { CircleStatus, Circle } from '@/types';
import { logAdminAction } from '@/lib/auditLogger';

interface AdminUpdateCircleStatusPayload {
  circleId: string;
  newStatus: CircleStatus;
  actingAdminId: string; 
  circleName: string; // For logging
}

export async function adminUpdateCircleStatusAction(payload: AdminUpdateCircleStatusPayload): Promise<{ success: boolean; error?: string }> {
  const { circleId, newStatus, actingAdminId, circleName } = payload;
  try {
    const circleRef = doc(firestore, 'Circles', circleId);
    const circleSnap = await getDoc(circleRef);

    if (!circleSnap.exists()) {
      return { success: false, error: "Circle not found." };
    }
    
    const oldStatus = circleSnap.data()?.status;

    await updateDoc(circleRef, {
      status: newStatus,
      // lastAdminActionTimestamp: serverTimestamp(), // Consider adding if more detailed internal tracking is needed
      // lastAdminActionBy: actingAdminId, 
    });

    if (payload.newStatus === 'Barred_NameIssue') {
      const circleData = circleSnap.data() as Circle;
      // TODO: Send notification to circleData.creatorUserID if implementing notifications
      console.log(`Circle ${payload.circleId} barred. TODO: Notify creator ${circleData.creatorUserID}`);
    }

    await logAdminAction({
      actingAdminId,
      actionType: 'CIRCLE_STATUS_CHANGE_ADMIN',
      targetEntityType: 'Circle',
      targetEntityId: circleId,
      targetEntityDisplay: circleName,
      details: `Circle status changed from ${oldStatus || 'Unknown'} to ${newStatus}.`,
    });

    return { success: true };

  } catch (error: any) {
    console.error("Error in adminUpdateCircleStatusAction:", error);
    return { success: false, error: error.message || "Failed to update circle status." };
  }
}
