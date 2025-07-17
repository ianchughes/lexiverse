
'use server';

import { firestore } from '@/lib/firebase';
import { doc, updateDoc, getDoc, serverTimestamp, collection, addDoc, writeBatch, query, where, type Timestamp, getDocs } from 'firebase/firestore';
import type { CircleStatus, Circle, CircleMember } from '@/types';
import { logAdminAction } from '@/lib/auditLogger';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 10);
const MAIL_COLLECTION = "mail";

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

interface AdminCreateCircleWithMembersPayload {
  circleName: string;
  memberIds: string[]; // Array of UIDs
  actingAdminId: string;
}
interface UserInfo { id: string; username: string; email: string; }

export async function adminCreateCircleWithMembersAction(payload: AdminCreateCircleWithMembersPayload): Promise<{ success: boolean; error?: string; circleId?: string; }> {
  const { circleName, memberIds, actingAdminId } = payload;
  if (!circleName.trim()) return { success: false, error: "Circle name is required." };
  if (memberIds.length === 0) return { success: false, error: "At least one member must be selected." };
  
  const nameQuery = query(collection(firestore, 'Circles'), where('circleNameLower', '==', circleName.toLowerCase()));
  const nameSnap = await getDocs(nameQuery);
  if (!nameSnap.empty) return { success: false, error: `Circle name "${circleName}" is already taken.` };

  try {
    const batch = writeBatch(firestore);
    
    // 1. Create the Circle document
    const newCircleRef = doc(collection(firestore, 'Circles'));
    const inviteLinkCode = nanoid(8);
    const newCircleData: Omit<Circle, 'id'> = {
      circleName: circleName,
      circleNameLower: circleName.toLowerCase(),
      creatorUserID: actingAdminId, // Admin is the creator
      dateCreated: serverTimestamp() as Timestamp,
      status: 'Active',
      isPublic: false, // Default to private for admin-created circles
      inviteLinkCode: inviteLinkCode,
      memberCount: memberIds.length,
    };
    batch.set(newCircleRef, newCircleData);
    
    // 2. Fetch user info and create members & emails
    const usersToInviteQuery = query(collection(firestore, 'Users'), where('uid', 'in', memberIds));
    const usersSnapshot = await getDocs(usersToInviteQuery);
    const usersFoundMap = new Map<string, UserInfo>();
    usersSnapshot.forEach(userDoc => usersFoundMap.set(userDoc.id, { id: userDoc.id, ...userDoc.data() } as UserInfo));

    if (usersFoundMap.size !== memberIds.length) {
      const notFoundIds = memberIds.filter(id => !usersFoundMap.has(id));
      console.warn("Could not find all users for circle creation:", notFoundIds);
    }
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    usersFoundMap.forEach(user => {
      const memberDocRef = doc(firestore, 'CircleMembers', `${newCircleRef.id}_${user.id}`);
      const newMemberData: Omit<CircleMember, 'id'> = {
        circleId: newCircleRef.id,
        userId: user.id,
        username: user.username,
        role: 'Member', // All invited members are 'Member' role by default
        dateJoined: serverTimestamp() as Timestamp,
      };
      batch.set(memberDocRef, newMemberData);

      const emailContent = {
        to: [user.email],
        message: {
          subject: `You've been added to the Circle "${circleName}"!`,
          html: `<p>Hello ${user.username},</p>
                 <p>A LexiVerse admin has created and added you to a new Circle: <strong>${circleName}</strong>.</p>
                 <p>You can now see the circle and participate in its leaderboard. No further action is needed.</p>
                 <p><a href="${appUrl}/circles/${newCircleRef.id}">Click here to view the circle.</a></p>
                 <p>Happy Puzzling!<br/>The LexiVerse Team</p>`,
        },
        createdTimestamp: serverTimestamp(),
      };
      batch.set(doc(collection(firestore, MAIL_COLLECTION)), emailContent);
    });

    await batch.commit();

    await logAdminAction({
      actingAdminId,
      actionType: 'CIRCLE_CREATE_ADMIN',
      targetEntityType: 'Circle',
      targetEntityId: newCircleRef.id,
      targetEntityDisplay: circleName,
      details: `Created circle with ${memberIds.length} members.`,
    });

    return { success: true, circleId: newCircleRef.id };
  } catch (error: any) {
    console.error("Error in adminCreateCircleWithMembersAction:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}
