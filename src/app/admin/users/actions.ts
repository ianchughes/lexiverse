
'use server';

import { firestore } from '@/lib/firebase';
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch, runTransaction, increment, getDoc, setDoc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import type { UserProfile, AdminRoleDoc, UserRole, AccountStatus, MasterWordType, CircleMember, Circle } from '@/types';
import { logAdminAction } from '@/lib/auditLogger';

const MAIL_COLLECTION = "mail"; // For Trigger Email extension

interface AdminUserActionBasePayload {
  actingAdminId: string;
  targetUserId: string;
}

interface AdminDeleteUserPayload extends AdminUserActionBasePayload {
  targetUsername: string; // For logging
}

export async function adminDeleteUserAndReleaseWordsAction(payload: AdminDeleteUserPayload): Promise<{ success: boolean; error?: string }> {
  const { targetUserId, actingAdminId, targetUsername } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Action requires an authenticated admin." };
  }
  if (targetUserId === actingAdminId) {
    return { success: false, error: "Administrators cannot delete their own accounts through this panel." };
  }

  const batch = writeBatch(firestore);

  try {
    const userProfileRef = doc(firestore, "Users", targetUserId);
    batch.delete(userProfileRef);

    const adminRoleRef = doc(firestore, "admin_users", targetUserId);
    const adminRoleSnap = await getDoc(adminRoleRef);
    if (adminRoleSnap.exists()) {
        batch.delete(adminRoleRef);
    }

    const wordsQuery = query(collection(firestore, "Words"), where("originalSubmitterUID", "==", targetUserId));
    const wordsSnapshot = await getDocs(wordsQuery);
    wordsSnapshot.forEach(wordDoc => {
      batch.update(wordDoc.ref, {
        originalSubmitterUID: null,
        puzzleDateGMTOfSubmission: null,
        pendingTransferId: null,
      });
    });

    const circleMembershipsQuery = query(collection(firestore, "CircleMembers"), where("userId", "==", targetUserId));
    const circleMembershipsSnapshot = await getDocs(circleMembershipsQuery);

    for (const memberDoc of circleMembershipsSnapshot.docs) {
      const memberData = memberDoc.data() as CircleMember;
      const circleRef = doc(firestore, "Circles", memberData.circleId);
      batch.delete(memberDoc.ref);
      batch.update(circleRef, { memberCount: increment(-1) });

      const circleSnap = await getDoc(circleRef);
      if (circleSnap.exists()){
          const circleData = circleSnap.data() as Circle;
          if(circleData.creatorUserID === targetUserId && circleData.memberCount -1 > 0) {
              console.warn(`User ${targetUserId} was creator of circle ${memberData.circleId}. Circle is now orphaned.`);
          } else if (circleData.creatorUserID === targetUserId && circleData.memberCount -1 <= 0) {
              batch.delete(circleRef);
              console.log(`Circle ${memberData.circleId} deleted as its creator and last member ${targetUserId} was deleted.`);
          }
      }
    }
    
    await batch.commit();

    await logAdminAction({
      actingAdminId,
      actionType: 'USER_DELETE',
      targetEntityType: 'User',
      targetEntityId: targetUserId,
      targetEntityDisplay: targetUsername,
      details: `User ${targetUsername} (UID: ${targetUserId}) deleted. Words released, removed from circles.`,
    });

    return { success: true };

  } catch (error: any) {
    console.error("Error in adminDeleteUserAndReleaseWordsAction:", error);
    return { success: false, error: error.message || "Failed to delete user and release words." };
  }
}


interface AdminUpdateUserRolePayload extends AdminUserActionBasePayload {
  targetUsername: string;
  newRole: UserRole;
  oldRole: UserRole;
}

export async function adminUpdateUserRoleAction(payload: AdminUpdateUserRolePayload): Promise<{ success: boolean; error?: string }> {
  const { actingAdminId, targetUserId, targetUsername, newRole, oldRole } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Authentication required." };
  }
  if (targetUserId === actingAdminId && newRole !== oldRole) {
    return { success: false, error: "Admins cannot change their own role." };
  }

  try {
    const userAdminRoleRef = doc(firestore, "admin_users", targetUserId);
    if (newRole === 'admin' || newRole === 'moderator') {
      await setDoc(userAdminRoleRef, { role: newRole });
    } else { // Demoting to 'user'
      const docSnap = await getDoc(userAdminRoleRef);
      if (docSnap.exists()) {
        await deleteDoc(userAdminRoleRef);
      }
    }

    await logAdminAction({
      actingAdminId,
      actionType: 'USER_ROLE_CHANGE',
      targetEntityType: 'User',
      targetEntityId: targetUserId,
      targetEntityDisplay: targetUsername,
      details: `Role changed from ${oldRole} to ${newRole}.`,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error updating user role:", error);
    return { success: false, error: error.message || "Failed to update role." };
  }
}

interface AdminUpdateUserStatusPayload extends AdminUserActionBasePayload {
  targetUsername: string;
  newStatus: AccountStatus;
  oldStatus: AccountStatus;
}

export async function adminUpdateUserStatusAction(payload: AdminUpdateUserStatusPayload): Promise<{ success: boolean; error?: string }> {
  const { actingAdminId, targetUserId, targetUsername, newStatus, oldStatus } = payload;
  
  if (!actingAdminId) {
    return { success: false, error: "Authentication required." };
  }
  if (targetUserId === actingAdminId && newStatus === 'Blocked') {
    return { success: false, error: "Admins cannot block their own accounts." };
  }

  try {
    const userProfileRef = doc(firestore, "Users", targetUserId);
    await updateDoc(userProfileRef, { accountStatus: newStatus });

    await logAdminAction({
      actingAdminId,
      actionType: 'USER_STATUS_CHANGE',
      targetEntityType: 'User',
      targetEntityId: targetUserId,
      targetEntityDisplay: targetUsername,
      details: `Status changed from ${oldStatus} to ${newStatus}.`,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error updating user status:", error);
    return { success: false, error: error.message || "Failed to update status." };
  }
}

interface AdminSendEmailToUserPayload extends AdminUserActionBasePayload {
  targetUsername: string; // For logging and email greeting
  subject: string;
  messageBody: string;
}

export async function adminSendEmailToUserAction(payload: AdminSendEmailToUserPayload): Promise<{ success: boolean; error?: string }> {
  const { actingAdminId, targetUserId, targetUsername, subject, messageBody } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Admin authentication required." };
  }
  if (!targetUserId) {
    return { success: false, error: "Target user ID is required." };
  }
  if (!subject.trim() || !messageBody.trim()) {
    return { success: false, error: "Subject and message body are required." };
  }

  try {
    const userProfileRef = doc(firestore, "Users", targetUserId);
    const userProfileSnap = await getDoc(userProfileRef);

    if (!userProfileSnap.exists()) {
      return { success: false, error: "Target user profile not found." };
    }
    const userProfile = userProfileSnap.data() as UserProfile;
    const targetEmail = userProfile.email;

    if (!targetEmail) {
      return { success: false, error: "Target user does not have an email address." };
    }

    const emailContent = {
      to: [targetEmail],
      message: {
        subject: subject,
        html: `<p>Hello ${userProfile.username || 'User'},</p>
               <p>${messageBody.replace(/\n/g, '<br>')}</p>
               <p>Regards,<br/>The LexiVerse Admin Team</p>`,
      },
    };

    await addDoc(collection(firestore, MAIL_COLLECTION), emailContent);

    await logAdminAction({
      actingAdminId,
      actionType: 'USER_EMAIL_SEND',
      targetEntityType: 'User',
      targetEntityId: targetUserId,
      targetEntityDisplay: targetUsername,
      details: `Email sent. Subject: "${subject}"`,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error sending email to user:", error);
    return { success: false, error: error.message || "Failed to send email." };
  }
}
