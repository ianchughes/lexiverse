
'use server';

import { firestore, auth } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { CircleInviteStatus, AppNotification } from '@/types';

interface AdminCircleInviteActionPayload {
  inviteId: string;
}

interface AdminUpdateCircleInviteStatusPayload extends AdminCircleInviteActionPayload {
  newStatus: CircleInviteStatus;
  adminNotes?: string;
}

export async function adminDeleteCircleInviteAction(payload: AdminCircleInviteActionPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId } = payload;
    // Optional: Add admin permission check here
    // const currentUserUID = auth.currentUser?.uid;
    // if (!currentUserUID) return { success: false, error: "Authentication required." };
    // const adminRole = await checkAdminRole(currentUserUID); // Implement this function
    // if (adminRole !== 'admin') return { success: false, error: "Permission denied." };

    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    await deleteDoc(inviteRef);
    return { success: true };
  } catch (error: any) {
    console.error("Error in adminDeleteCircleInviteAction:", error);
    return { success: false, error: error.message || "Failed to delete circle invite." };
  }
}

export async function adminUpdateCircleInviteStatusAction(payload: AdminUpdateCircleInviteStatusPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId, newStatus, adminNotes } = payload;
    // Optional: Add admin permission check here

    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    const updateData: { status: CircleInviteStatus; adminNotes?: string, dateResponded?: Timestamp } = { status: newStatus };
    
    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }
    if (newStatus === 'Accepted' || newStatus === 'Declined' || newStatus === 'Expired') {
        updateData.dateResponded = serverTimestamp() as Timestamp;
    }

    await updateDoc(inviteRef, updateData);
    return { success: true };
  } catch (error: any) {
    console.error("Error in adminUpdateCircleInviteStatusAction:", error);
    return { success: false, error: error.message || "Failed to update invite status." };
  }
}

export async function adminSendCircleInviteReminderAction(payload: AdminCircleInviteActionPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId } = payload;
    // Optional: Add admin permission check here

    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    const inviteSnap = await getDoc(inviteRef);

    if (!inviteSnap.exists()) {
      return { success: false, error: "Invite not found." };
    }
    const inviteData = inviteSnap.data();

    await updateDoc(inviteRef, {
      lastReminderSentTimestamp: serverTimestamp(),
      adminNotes: `${inviteData.adminNotes || ''} Reminder manually triggered by admin on ${new Date().toISOString()}`.trim()
    });

    if (inviteData.status === 'SentToEmail' && inviteData.inviteeEmail) {
      // Placeholder for actual email sending logic
      console.log(`ADMIN ACTION: Reminder email should be re-sent to ${inviteData.inviteeEmail} for invite ID ${inviteId} to join circle "${inviteData.circleName}".`);
      // In a real app, you would trigger an email service here.
    } else if (inviteData.status === 'Sent' && inviteData.inviteeUserId) {
      // Placeholder for re-sending in-app notification
      // This might involve creating a new Notification document or using another mechanism
      console.log(`ADMIN ACTION: In-app reminder should be sent to user ${inviteData.inviteeUserId} for invite ID ${inviteId} to join circle "${inviteData.circleName}".`);
      // Example: Create a new generic notification
      // const notifPayload: Omit<AppNotification, 'id' | 'dateCreated'> = {
      //   userId: inviteData.inviteeUserId,
      //   message: `Friendly reminder: You have a pending invitation to join circle "${inviteData.circleName}".`,
      //   type: 'Generic', 
      //   isRead: false,
      //   link: `/notifications` 
      // };
      // await addDoc(collection(firestore, 'Notifications'), { ...notifPayload, dateCreated: serverTimestamp() });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in adminSendCircleInviteReminderAction:", error);
    return { success: false, error: error.message || "Failed to send reminder for circle invite." };
  }
}
