
'use server';

import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, writeBatch, query, where, getDocs, updateDoc, deleteDoc, runTransaction, increment, getDoc, Timestamp } from 'firebase/firestore';
import type { Circle, CircleMember, CircleInvite, UserProfile, CircleInviteStatus, CircleMemberRole, AppNotification } from '@/types';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 10);


interface CreateCirclePayload {
  circleName: string;
  isPublic: boolean;
  publicDescription: string;
  creatorUserID: string;
  creatorUsername: string;
}

export async function createCircleAction(payload: CreateCirclePayload): Promise<{ success: boolean; circleId?: string; error?: string }> {
  try {
    if (!payload.circleName.trim()) {
      return { success: false, error: "Circle name cannot be empty." };
    }
    const nameQuery = query(collection(firestore, 'Circles'), where('circleNameLower', '==', payload.circleName.toLowerCase()));
    const nameSnap = await getDocs(nameQuery);
    if (!nameSnap.empty) {
      return { success: false, error: `Circle name "${payload.circleName}" is already taken.` };
    }

    const newCircleRef = doc(collection(firestore, 'Circles'));
    const inviteLinkCode = nanoid(8);

    const newCircleData: Omit<Circle, 'id'> = {
      circleName: payload.circleName,
      circleNameLower: payload.circleName.toLowerCase(),
      creatorUserID: payload.creatorUserID,
      dateCreated: serverTimestamp() as Timestamp,
      status: 'Active',
      isPublic: payload.isPublic,
      publicDescription: payload.publicDescription,
      inviteLinkCode: inviteLinkCode,
      memberCount: 1,
    };

    const newMemberData: Omit<CircleMember, 'id'> = {
      circleId: newCircleRef.id,
      userId: payload.creatorUserID,
      username: payload.creatorUsername,
      role: 'Admin',
      dateJoined: serverTimestamp() as Timestamp,
    };
    
    const memberDocRef = doc(firestore, 'CircleMembers', `${newCircleRef.id}_${payload.creatorUserID}`);

    const batch = writeBatch(firestore);
    batch.set(newCircleRef, newCircleData);
    batch.set(memberDocRef, newMemberData);
    
    await batch.commit();

    return { success: true, circleId: newCircleRef.id };

  } catch (error: any) {
    console.error("Error in createCircleAction:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

interface AmendCircleDetailsPayload {
    circleId: string;
    requestingUserId: string;
    newData: {
        circleName: string;
        isPublic: boolean;
        publicDescription: string;
    };
}

export async function amendCircleDetailsAction(payload: AmendCircleDetailsPayload): Promise<{ success: boolean; error?: string }> {
    try {
        const circleRef = doc(firestore, 'Circles', payload.circleId);
        const circleSnap = await getDoc(circleRef);

        if (!circleSnap.exists()) return { success: false, error: "Circle not found." };
        const circleData = circleSnap.data() as Circle;

        if (circleData.creatorUserID !== payload.requestingUserId) {
            const memberQuery = query(collection(firestore, 'CircleMembers'), 
                where('circleId', '==', payload.circleId), 
                where('userId', '==', payload.requestingUserId),
                where('role', '==', 'Admin'));
            const memberSnap = await getDocs(memberQuery);
            if (memberSnap.empty) {
                return { success: false, error: "You don't have permission to edit this circle." };
            }
        }
        
        if (payload.newData.circleName !== circleData.circleName) {
            const nameQuery = query(collection(firestore, 'Circles'), 
                where('circleNameLower', '==', payload.newData.circleName.toLowerCase()));
            const nameSnap = await getDocs(nameQuery);
            if (!nameSnap.empty && nameSnap.docs[0].id !== payload.circleId) {
                 return { success: false, error: `Circle name "${payload.newData.circleName}" is already taken.` };
            }
        }

        await updateDoc(circleRef, {
            circleName: payload.newData.circleName,
            circleNameLower: payload.newData.circleName.toLowerCase(),
            isPublic: payload.newData.isPublic,
            publicDescription: payload.newData.publicDescription,
        });

        return { success: true };

    } catch (error: any) {
        console.error("Error in amendCircleDetailsAction:", error);
        return { success: false, error: error.message || "Failed to update circle." };
    }
}

interface CircleActionPayload {
    circleId: string;
    userId: string;
}

export async function leaveCircleAction(payload: CircleActionPayload): Promise<{ success: boolean; error?: string }> {
    try {
        const circleRef = doc(firestore, 'Circles', payload.circleId);
        const memberRef = doc(firestore, 'CircleMembers', `${payload.circleId}_${payload.userId}`);

        await runTransaction(firestore, async (transaction) => {
            const circleSnap = await transaction.get(circleRef);
            if (!circleSnap.exists()) throw new Error("Circle not found.");
            const circleData = circleSnap.data() as Circle;

            const memberSnap = await transaction.get(memberRef);
            if (!memberSnap.exists()) throw new Error("You are not a member of this circle.");
            
            if (circleData.creatorUserID === payload.userId && circleData.memberCount <= 1) {
                // If the creator is the last member, they should delete the circle instead of leaving.
                throw new Error("As the sole admin/creator, you must delete the circle instead of leaving.");
            }
            if (circleData.creatorUserID === payload.userId && circleData.memberCount > 1) {
                // If the creator tries to leave and there are other members, prevent it unless they appoint a new admin.
                // For simplicity now, we'll prevent it. A more complex system could allow admin transfer.
                 throw new Error("The circle creator cannot leave if other members exist. Please delete the circle or transfer ownership (feature not yet implemented).");
            }


            transaction.delete(memberRef);
            transaction.update(circleRef, { memberCount: increment(-1) });
        });
        
        return { success: true };
    } catch (error: any) {
        console.error("Error in leaveCircleAction:", error);
        return { success: false, error: error.message || "Failed to leave circle." };
    }
}


interface DeleteCirclePayload {
    circleId: string;
    requestingUserId: string;
}
export async function deleteCircleAction(payload: DeleteCirclePayload): Promise<{ success: boolean; error?: string }> {
    try {
        const circleRef = doc(firestore, 'Circles', payload.circleId);
        const circleSnap = await getDoc(circleRef);
        if (!circleSnap.exists()) return { success: false, error: "Circle not found." };
        
        const circleData = circleSnap.data() as Circle;
        // Only creator or an Admin can delete
        if (circleData.creatorUserID !== payload.requestingUserId) {
            const memberQuery = query(collection(firestore, 'CircleMembers'), 
                where('circleId', '==', payload.circleId), 
                where('userId', '==', payload.requestingUserId),
                where('role', '==', 'Admin'));
            const memberSnap = await getDocs(memberQuery);
            if (memberSnap.empty) {
                 return { success: false, error: "You don't have permission to delete this circle." };
            }
        }

        const batch = writeBatch(firestore);
        batch.delete(circleRef);

        const membersQuery = query(collection(firestore, 'CircleMembers'), where('circleId', '==', payload.circleId));
        const membersSnap = await getDocs(membersQuery);
        membersSnap.forEach(doc => batch.delete(doc.ref));
        
        // Also delete associated invites
        const invitesQuery = query(collection(firestore, 'CircleInvites'), where('circleId', '==', payload.circleId));
        const invitesSnap = await getDocs(invitesQuery);
        invitesSnap.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        return { success: true };

    } catch (error: any) {
        console.error("Error in deleteCircleAction:", error);
        return { success: false, error: error.message || "Failed to delete circle." };
    }
}


interface SendCircleInvitePayload {
  circleId: string;
  circleName: string;
  inviterUserId: string;
  inviterUsername: string;
  inviteeUserId?: string;
  inviteeEmail?: string;
  inviteeUsername?: string; // Target username for invitation
}

export async function sendCircleInviteAction(payload: SendCircleInvitePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { circleId, circleName, inviterUserId, inviterUsername, inviteeUserId, inviteeEmail, inviteeUsername: targetUsername } = payload;

    const circleDocSnap = await getDoc(doc(firestore, 'Circles', circleId));
    if (!circleDocSnap.exists()){
        return { success: false, error: "Circle not found." };
    }
    const circleData = circleDocSnap.data() as Circle;

    // Permission check: Inviter must be Admin or Influencer, or the circle creator
    let canInvite = false;
    if (circleData.creatorUserID === inviterUserId) {
        canInvite = true;
    } else {
        const inviterMemberQuery = query(collection(firestore, 'CircleMembers'), 
            where('circleId', '==', circleId), 
            where('userId', '==', inviterUserId),
            where('role', 'in', ['Admin', 'Influencer'])
        );
        const inviterMemberSnap = await getDocs(inviterMemberQuery);
        if (!inviterMemberSnap.empty) {
            canInvite = true;
        }
    }

    if (!canInvite) {
        return { success: false, error: "You don't have permission to invite members to this circle." };
    }
    
    let finalInviteeUserId: string | undefined = inviteeUserId;
    let finalInviteeEmail: string | undefined = inviteeEmail?.toLowerCase();


    if (targetUsername) {
      const usersQuery = query(collection(firestore, "Users"), where("username", "==", targetUsername));
      const userSnapshot = await getDocs(usersQuery);
      if (userSnapshot.empty) {
        return { success: false, error: `User "${targetUsername}" not found.` };
      }
      finalInviteeUserId = userSnapshot.docs[0].id;
      if (finalInviteeUserId === inviterUserId) {
        return { success: false, error: "You cannot invite yourself." };
      }
    } else if (finalInviteeEmail) {
      const usersQuery = query(collection(firestore, "Users"), where("email", "==", finalInviteeEmail));
      const userSnapshot = await getDocs(usersQuery);
      if (!userSnapshot.empty) {
        finalInviteeUserId = userSnapshot.docs[0].id; 
         if (finalInviteeUserId === inviterUserId) {
          return { success: false, error: "You cannot invite yourself." };
        }
      }
    } else {
        return { success: false, error: "Invitee username or email must be provided."};
    }

    if (finalInviteeUserId) {
      const memberCheckRef = doc(firestore, 'CircleMembers', `${circleId}_${finalInviteeUserId}`);
      const memberCheckSnap = await getDoc(memberCheckRef);
      if(memberCheckSnap.exists()) {
          return { success: false, error: "This user is already a member of the circle." };
      }
    }

    let existingInviteQuery;
    if (finalInviteeUserId) {
        existingInviteQuery = query(collection(firestore, 'CircleInvites'), 
            where('circleId', '==', circleId), 
            where('inviteeUserId', '==', finalInviteeUserId),
            where('status', 'in', ['Sent', 'SentToEmail'])
        );
    } else if (finalInviteeEmail) {
        existingInviteQuery = query(collection(firestore, 'CircleInvites'), 
            where('circleId', '==', circleId), 
            where('inviteeEmail', '==', finalInviteeEmail),
            where('status', '==', 'SentToEmail')
        );
    }
    if (existingInviteQuery) {
        const existingInviteSnap = await getDocs(existingInviteQuery);
        if (!existingInviteSnap.empty) {
            return { success: false, error: "An invite has already been sent to this user/email for this circle." };
        }
    }

    const newInviteDataPayload: {
      circleId: string;
      circleName: string;
      inviterUserId: string;
      inviterUsername: string;
      inviteeUserId?: string;
      inviteeEmail?: string;
      status: CircleInviteStatus;
      dateSent: Timestamp; 
    } = {
      circleId: circleId,
      circleName: circleName,
      inviterUserId: inviterUserId,
      inviterUsername: inviterUsername,
      status: finalInviteeUserId ? 'Sent' : 'SentToEmail',
      dateSent: serverTimestamp() as Timestamp,
    };

    if (finalInviteeUserId !== undefined) {
      newInviteDataPayload.inviteeUserId = finalInviteeUserId;
    }
    if (finalInviteeEmail !== undefined) {
      newInviteDataPayload.inviteeEmail = finalInviteeEmail;
    }


    await addDoc(collection(firestore, 'CircleInvites'), newInviteDataPayload);

    if (!finalInviteeUserId && finalInviteeEmail) {
      console.log(`ACTION REQUIRED: Send email invite to ${finalInviteeEmail} for circle ${circleName}. Include invite ID for linking.`);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in sendCircleInviteAction:", error);
    return { success: false, error: error.message || "Failed to send invite." };
  }
}

interface RespondToCircleInvitePayload {
  inviteId: string;
  inviteeUserId: string;
  inviteeUsername: string;
  responseType: 'Accepted' | 'Declined';
}

export async function respondToCircleInviteAction(payload: RespondToCircleInvitePayload): Promise<{ success: boolean; error?: string, circleId?: string }> {
  const inviteRef = doc(firestore, 'CircleInvites', payload.inviteId);
  try {
    return await runTransaction(firestore, async (transaction) => {
      // --- START READ PHASE ---
      const inviteSnap = await transaction.get(inviteRef);
      let circleSnap;
      let inviterSnap; // Declare here to ensure it's in scope for the write phase if needed.

      if (!inviteSnap.exists()) {
        throw new Error("Invite not found or has expired.");
      }
      const inviteData = inviteSnap.data() as CircleInvite;

      const circleRef = doc(firestore, 'Circles', inviteData.circleId);
      const inviterProfileRef = doc(firestore, 'Users', inviteData.inviterUserId);
      
      // Read all necessary documents before any writes
      if (payload.responseType === 'Accepted') {
        circleSnap = await transaction.get(circleRef);
        if (!circleSnap.exists()) {
          throw new Error("The circle no longer exists.");
        }
        inviterSnap = await transaction.get(inviterProfileRef);
        // inviterSnap existence check is done before write, if inviterSnap is used.
      }
      // --- END READ PHASE ---

      // --- START VALIDATION AND LOGIC (based on reads) ---
      if (inviteData.inviteeUserId && inviteData.inviteeUserId !== payload.inviteeUserId) {
        throw new Error("This invite is not for you.");
      }
      if (inviteData.status !== 'Sent' && inviteData.status !== 'SentToEmail') {
        throw new Error("This invite has already been responded to or is no longer valid.");
      }
      // --- END VALIDATION ---

      // --- START WRITE PHASE ---
      transaction.update(inviteRef, { 
        status: payload.responseType,
        dateResponded: serverTimestamp() as Timestamp,
        inviteeUserId: payload.inviteeUserId, // Ensure inviteeUserId is set even if originally by email
      });

      if (payload.responseType === 'Accepted') {
        // Ensure circleSnap was read if we are here
        if (!circleSnap || !circleSnap.exists()) { // Redundant if logic correct, but good safeguard.
             throw new Error("Circle data inconsistency during transaction.");
        }

        const newMemberData: Omit<CircleMember, 'id'> = {
          circleId: inviteData.circleId,
          userId: payload.inviteeUserId,
          username: payload.inviteeUsername,
          role: 'Member',
          dateJoined: serverTimestamp() as Timestamp,
        };
        const memberDocRef = doc(firestore, 'CircleMembers', `${inviteData.circleId}_${payload.inviteeUserId}`);
        transaction.set(memberDocRef, newMemberData);
        transaction.update(circleRef, { memberCount: increment(1) });

        if (inviterSnap && inviterSnap.exists()) { // Check inviterSnap from read phase if it was read
            transaction.update(inviterProfileRef, { overallPersistentScore: increment(10) });
        }
        return { success: true, circleId: inviteData.circleId };
      }
      // --- END WRITE PHASE ---
      return { success: true };
    });
  } catch (error: any) {
    console.error("Error in respondToCircleInviteAction:", error);
    return { success: false, error: error.message || "Failed to respond to invite." };
  }
}

interface JoinCircleWithInviteCodePayload {
  inviteCode: string;
  userId: string;
  username: string;
}

export async function joinCircleWithInviteCodeAction(payload: JoinCircleWithInviteCodePayload): Promise<{ success: boolean; circleId?: string; error?: string }> {
  try {
    const circlesQuery = query(collection(firestore, 'Circles'), where('inviteLinkCode', '==', payload.inviteCode));
    const circlesSnap = await getDocs(circlesQuery);

    if (circlesSnap.empty) {
      return { success: false, error: "Invalid or expired invite code." };
    }
    const circleDocSnap = circlesSnap.docs[0];
    const circleData = circleDocSnap.data() as Circle;
    const circleId = circleDocSnap.id;

    if (circleData.status !== 'Active') {
      return { success: false, error: "This circle is currently not active or accepting new members." };
    }

    const memberRef = doc(firestore, 'CircleMembers', `${circleId}_${payload.userId}`);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) {
      return { success: true, circleId, error: "You are already a member of this circle." }; // Return success true, but with error message
    }
    
    const newMemberData: Omit<CircleMember, 'id'> = {
      circleId: circleId,
      userId: payload.userId,
      username: payload.username,
      role: 'Member',
      dateJoined: serverTimestamp() as Timestamp,
    };
    
    const batch = writeBatch(firestore);
    batch.set(memberRef, newMemberData);
    batch.update(doc(firestore, 'Circles', circleId), { memberCount: increment(1) });
    await batch.commit();

    return { success: true, circleId: circleId };

  } catch (error: any) {
    console.error("Error in joinCircleWithInviteCodeAction:", error);
    return { success: false, error: error.message || "Failed to join circle with code." };
  }
}

interface UpdateUserDailyCircleScorePayload {
  userId: string;
  puzzleDateGMT: string; 
  finalDailyScore: number;
}

export async function updateUserCircleDailyScoresAction(payload: UpdateUserDailyCircleScorePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const memberQuery = query(collection(firestore, 'CircleMembers'), where('userId', '==', payload.userId));
    const memberSnap = await getDocs(memberQuery);

    if (memberSnap.empty) return { success: true }; 

    const batch = writeBatch(firestore);

    memberSnap.forEach(memberDoc => {
      const circleId = memberDoc.data().circleId;
      const dailyScoreDocId = `${payload.puzzleDateGMT}_${circleId}`;
      const dailyScoreRef = doc(firestore, 'CircleDailyScores', dailyScoreDocId);
      
      batch.set(dailyScoreRef, { 
        dailyTotalScore: increment(payload.finalDailyScore),
        puzzleDateGMT: payload.puzzleDateGMT, 
        circleId: circleId,
      }, { merge: true });
    });

    await batch.commit();
    return { success: true };

  } catch (error: any) {
    console.error("Error in updateUserCircleDailyScoresAction:", error);
    return { success: false, error: error.message || "Failed to update circle daily scores." };
  }
}

// User-initiated invite management actions
interface UserManageInvitePayload {
  inviteId: string;
  requestingUserId: string;
  circleId: string; // To verify admin rights on this specific circle
}

export async function userDeleteCircleInviteAction(payload: UserManageInvitePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId, requestingUserId, circleId } = payload;

    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) {
      return { success: false, error: "Invite not found." };
    }
    const inviteData = inviteSnap.data() as CircleInvite;
    if (inviteData.circleId !== circleId) {
      return { success: false, error: "Invite does not belong to the specified circle." };
    }

    // Verify admin permission
    const memberQuery = query(collection(firestore, 'CircleMembers'), 
      where('circleId', '==', circleId), 
      where('userId', '==', requestingUserId),
      where('role', '==', 'Admin')
    );
    const memberSnap = await getDocs(memberQuery);
    if (memberSnap.empty) {
      // Fallback: check if the requester is the creator of the circle
      const circleDoc = await getDoc(doc(firestore, 'Circles', circleId));
      if (!circleDoc.exists() || (circleDoc.data() as Circle).creatorUserID !== requestingUserId) {
        return { success: false, error: "You don't have permission to manage invites for this circle." };
      }
    }

    await deleteDoc(inviteRef);
    return { success: true };
  } catch (error: any) {
    console.error("Error in userDeleteCircleInviteAction:", error);
    return { success: false, error: error.message || "Failed to delete invite." };
  }
}

export async function userResendCircleInviteAction(payload: UserManageInvitePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { inviteId, requestingUserId, circleId } = payload;

    const inviteRef = doc(firestore, 'CircleInvites', inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) {
      return { success: false, error: "Invite not found." };
    }
    const inviteData = inviteSnap.data() as CircleInvite;
    if (inviteData.circleId !== circleId) {
      return { success: false, error: "Invite does not belong to the specified circle." };
    }
    if (inviteData.status !== 'Sent' && inviteData.status !== 'SentToEmail') {
        return { success: false, error: "Only pending invites can be resent." };
    }

    // Verify admin permission (same logic as delete)
    const memberQuery = query(collection(firestore, 'CircleMembers'), 
      where('circleId', '==', circleId), 
      where('userId', '==', requestingUserId),
      where('role', '==', 'Admin')
    );
    const memberSnap = await getDocs(memberQuery);
     if (memberSnap.empty) {
      const circleDoc = await getDoc(doc(firestore, 'Circles', circleId));
      if (!circleDoc.exists() || (circleDoc.data() as Circle).creatorUserID !== requestingUserId) {
        return { success: false, error: "You don't have permission to manage invites for this circle." };
      }
    }

    await updateDoc(inviteRef, {
      lastReminderSentTimestamp: serverTimestamp() as Timestamp
    });

    if (inviteData.status === 'SentToEmail' && inviteData.inviteeEmail) {
      console.log(`ACTION REQUIRED (User Resend): Send email invite reminder to ${inviteData.inviteeEmail} for circle ${inviteData.circleName}. Invite ID: ${inviteId}`);
    } else if (inviteData.status === 'Sent' && inviteData.inviteeUserId) {
      // Optionally, create a new in-app notification or just rely on the timestamp update.
      console.log(`User Resend: In-app invite reminder logged for user ${inviteData.inviteeUserId} for circle ${inviteData.circleName}. Invite ID: ${inviteId}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in userResendCircleInviteAction:", error);
    return { success: false, error: error.message || "Failed to resend invite." };
  }
}


interface UpdateMemberRolePayload {
  circleId: string;
  requestingUserId: string; // User making the change (must be Admin)
  targetUserId: string;    // User whose role is being changed
  newRole: 'Member' | 'Influencer'; // Allowed roles to change to/from via this action
}

export async function updateMemberRoleAction(payload: UpdateMemberRolePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { circleId, requestingUserId, targetUserId, newRole } = payload;

    if (requestingUserId === targetUserId) {
      return { success: false, error: "You cannot change your own role using this function." };
    }

    // 1. Verify requestingUser is an Admin of this circle
    const requesterMemberRef = doc(firestore, 'CircleMembers', `${circleId}_${requestingUserId}`);
    const requesterMemberSnap = await getDoc(requesterMemberRef);
    if (!requesterMemberSnap.exists() || requesterMemberSnap.data()?.role !== 'Admin') {
      return { success: false, error: "You do not have permission to manage roles in this circle." };
    }

    // 2. Verify targetUser is a member of this circle and not the creator trying to be demoted from Admin
    const targetMemberRef = doc(firestore, 'CircleMembers', `${circleId}_${targetUserId}`);
    const targetMemberSnap = await getDoc(targetMemberRef);
    if (!targetMemberSnap.exists()) {
      return { success: false, error: "Target user is not a member of this circle." };
    }
    const targetMemberData = targetMemberSnap.data() as CircleMember;
    if (targetMemberData.role === 'Admin') {
        return { success: false, error: "Admin roles cannot be changed through this action. Circle creator is always an Admin."}
    }

    // 3. Update the role
    await updateDoc(targetMemberRef, { role: newRole });

    // Optional: Send a notification to the target user about their role change
    const circleData = (await getDoc(doc(firestore, 'Circles', circleId))).data();
    const notificationPayload: Omit<AppNotification, 'id' | 'dateCreated'> = {
      userId: targetUserId,
      message: `Your role in circle "${circleData?.circleName || circleId}" has been changed to ${newRole}.`,
      type: 'CircleAdminAction',
      relatedEntityId: circleId,
      isRead: false,
      link: `/circles/${circleId}`,
    };
    await addDoc(collection(firestore, 'Notifications'), { ...notificationPayload, dateCreated: serverTimestamp() as Timestamp });


    return { success: true };

  } catch (error: any) {
    console.error("Error in updateMemberRoleAction:", error);
    return { success: false, error: error.message || "Failed to update member role." };
  }
}

interface RemoveCircleMemberPayload {
  circleId: string;
  requestingUserId: string; // Admin performing the action
  targetUserId: string;     // Member to be removed
}

export async function removeCircleMemberAction(payload: RemoveCircleMemberPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { circleId, requestingUserId, targetUserId } = payload;

    if (requestingUserId === targetUserId) {
      return { success: false, error: "You cannot remove yourself from the circle. Use 'Leave Circle' instead." };
    }

    const circleRef = doc(firestore, 'Circles', circleId);
    const requesterMemberRef = doc(firestore, 'CircleMembers', `${circleId}_${requestingUserId}`);
    const targetMemberRef = doc(firestore, 'CircleMembers', `${circleId}_${targetUserId}`);

    return await runTransaction(firestore, async (transaction) => {
      const circleSnap = await transaction.get(circleRef);
      if (!circleSnap.exists()) throw new Error("Circle not found.");
      const circleData = circleSnap.data() as Circle;

      const requesterMemberSnap = await transaction.get(requesterMemberRef);
      if (!requesterMemberSnap.exists() || requesterMemberSnap.data()?.role !== 'Admin') {
        throw new Error("You do not have permission to remove members from this circle.");
      }

      const targetMemberSnap = await transaction.get(targetMemberRef);
      if (!targetMemberSnap.exists()) {
        throw new Error("Target user is not a member of this circle.");
      }
      const targetMemberData = targetMemberSnap.data() as CircleMember;

      if (targetMemberData.role === 'Admin') {
        // This typically means they are the creator.
        // Admins (creators) cannot be removed by other admins (if multi-admin was a feature).
        // For now, an Admin (creator) can't be removed by this action.
        throw new Error("The Circle Admin (creator) cannot be removed by this action.");
      }
      
      transaction.delete(targetMemberRef);
      transaction.update(circleRef, { memberCount: increment(-1) });
      
      // Optional: Send a notification to the removed user
      const notificationPayload: Omit<AppNotification, 'id' | 'dateCreated'> = {
        userId: targetUserId,
        message: `You have been removed from the circle "${circleData.circleName}" by an admin.`,
        type: 'CircleAdminAction',
        relatedEntityId: circleId,
        isRead: false,
        link: `/circles`, // Link to general circles page as they are no longer part of this one
      };
      const notificationDocRef = doc(collection(firestore, 'Notifications')); // Auto-generate ID
      transaction.set(notificationDocRef, { ...notificationPayload, dateCreated: serverTimestamp() as Timestamp });

      return { success: true };
    });

  } catch (error: any) {
    console.error("Error in removeCircleMemberAction:", error);
    return { success: false, error: error.message || "Failed to remove member." };
  }
}
