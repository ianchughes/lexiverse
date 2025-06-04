
'use server';

import { firestore } from '@/lib/firebase'; // auth removed
import { doc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { CircleInviteStatus, CircleInvite } from '@/types'; // AppNotification removed as not used directly here
import { logAdminAction } from '@/lib/auditLogger';

interface AdminCircleInviteActionBasePayload {
  inviteId: string;
  actingAdminId: string;
}
interface AdminDeleteCircleInvitePayload extends AdminCircleInviteActionBasePayload {
  inviteeIdentifier: string; // email or username for logging
  circleName: string; // for logging
}

interface AdminUpdateCircleInviteStatusPayload extends AdminCircleInviteActionBasePayload {
  newStatus: CircleInviteStatus;
  inviteeIdentifier: string; // email or username for logging
  circleName: string; // for logging
  adminNotes?: string;
}

interface AdminSendCircleInviteReminderPayload extends AdminCircleInviteActionBasePayload {
    inviteeIdentifier: string; // email or username for logging
    circleName: string; // for logging
}


export async function adminDeleteCircleInviteAction(payload: AdminDeleteCircleInvitePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId, actingAdminId, inviteeIdentifier, circleName } = payload;
    if (!actingAdminId) return { success: false, error: "Authentication required." };
    
    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    await deleteDoc(inviteRef);

    await logAdminAction({
        actingAdminId,
        actionType: 'INVITE_DELETE_ADMIN',
        targetEntityType: 'CircleInvite',
        targetEntityId: inviteId,
        targetEntityDisplay: `Invite for ${inviteeIdentifier} to ${circleName}`,
        details: `Admin deleted circle invite ID ${inviteId}.`
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error in adminDeleteCircleInviteAction:", error);
    return { success: false, error: error.message || "Failed to delete circle invite." };
  }
}

export async function adminUpdateCircleInviteStatusAction(payload: AdminUpdateCircleInviteStatusPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId, newStatus, adminNotes, actingAdminId, inviteeIdentifier, circleName } = payload;
    if (!actingAdminId) return { success: false, error: "Authentication required." };

    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) return { success: false, error: "Invite not found." };
    const oldStatus = inviteSnap.data()?.status;

    const updateData: { status: CircleInviteStatus; adminNotes?: string, dateResponded?: Timestamp } = { status: newStatus };
    
    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }
    if (newStatus === 'Accepted' || newStatus === 'Declined' || newStatus === 'Expired') {
        updateData.dateResponded = serverTimestamp() as Timestamp;
    }

    await updateDoc(inviteRef, updateData);

    await logAdminAction({
        actingAdminId,
        actionType: 'INVITE_STATUS_UPDATE_ADMIN',
        targetEntityType: 'CircleInvite',
        targetEntityId: inviteId,
        targetEntityDisplay: `Invite for ${inviteeIdentifier} to ${circleName}`,
        details: `Admin updated status from ${oldStatus} to ${newStatus}. Notes: ${adminNotes || 'N/A'}`
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error in adminUpdateCircleInviteStatusAction:", error);
    return { success: false, error: error.message || "Failed to update invite status." };
  }
}

export async function adminSendCircleInviteReminderAction(payload: AdminSendCircleInviteReminderPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId, actingAdminId, inviteeIdentifier, circleName } = payload;
    if (!actingAdminId) return { success: false, error: "Authentication required." };

    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    const inviteSnap = await getDoc(inviteRef);

    if (!inviteSnap.exists()) {
      return { success: false, error: "Invite not found." };
    }
    const inviteData = inviteSnap.data() as CircleInvite;

    const adminNoteText = `${inviteData.adminNotes || ''} Reminder manually triggered by admin on ${new Date().toISOString()}`.trim();
    await updateDoc(inviteRef, {
      lastReminderSentTimestamp: serverTimestamp(),
      adminNotes: adminNoteText,
    });

    if (inviteData.status === 'SentToEmail' && inviteData.inviteeEmail) {
      console.log(`ADMIN ACTION: Reminder email should be re-sent to ${inviteData.inviteeEmail} for invite ID ${inviteId} to join circle "${inviteData.circleName}".`);
    } else if (inviteData.status === 'Sent' && inviteData.inviteeUserId) {
      console.log(`ADMIN ACTION: In-app reminder should be sent to user ${inviteData.inviteeUserId} for invite ID ${inviteId} to join circle "${inviteData.circleName}".`);
    }

    await logAdminAction({
        actingAdminId,
        actionType: 'INVITE_REMINDER_SEND_ADMIN',
        targetEntityType: 'CircleInvite',
        targetEntityId: inviteId,
        targetEntityDisplay: `Invite for ${inviteeIdentifier} to ${circleName}`,
        details: `Admin sent reminder for invite. Old Admin Notes: ${inviteData.adminNotes || 'N/A'}. New notes: ${adminNoteText}`
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error in adminSendCircleInviteReminderAction:", error);
    return { success: false, error: error.message || "Failed to send reminder for circle invite." };
  }
}
