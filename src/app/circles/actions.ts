
'use server';

import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, writeBatch, query, where, getDocs, updateDoc, deleteDoc, runTransaction, increment, getDoc } from 'firebase/firestore';
import type { Circle, CircleMember, CircleInvite, UserProfile } from '@/types';
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
      dateCreated: serverTimestamp() as any,
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
      dateJoined: serverTimestamp() as any,
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
                throw new Error("As the sole admin/creator, you must delete the circle or appoint another admin before leaving.");
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
  inviteeUserId?: string; // If inviting existing user by ID (derived from username search)
  inviteeEmail?: string;  // If inviting by email
  inviteeUsername?: string; // If inviting existing user by username (to find their ID)
}

export async function sendCircleInviteAction(payload: SendCircleInvitePayload): Promise<{ success: boolean; error?: string }> {
  try {
    const { circleId, circleName, inviterUserId, inviterUsername, inviteeUserId, inviteeEmail, inviteeUsername: targetUsername } = payload;

    // Verify inviter is admin
    const circleDocSnap = await getDoc(doc(firestore, 'Circles', circleId));
    if (!circleDocSnap.exists()){
        return { success: false, error: "Circle not found." };
    }
    const circleData = circleDocSnap.data() as Circle;
    if (circleData.creatorUserID !== inviterUserId) {
      const memberQuery = query(collection(firestore, 'CircleMembers'), 
        where('circleId', '==', circleId), 
        where('userId', '==', inviterUserId),
        where('role', '==', 'Admin'));
      const memberSnap = await getDocs(memberQuery);
      if (memberSnap.empty) {
        return { success: false, error: "You don't have permission to invite members to this circle." };
      }
    }

    let finalInviteeUserId: string | undefined = inviteeUserId;
    let finalInviteeEmail: string | undefined = inviteeEmail;

    // Scenario 1: Inviting by username
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
    }
    // Scenario 2: Inviting by email
    else if (finalInviteeEmail) {
      const usersQuery = query(collection(firestore, "Users"), where("email", "==", finalInviteeEmail));
      const userSnapshot = await getDocs(usersQuery);
      if (!userSnapshot.empty) {
        finalInviteeUserId = userSnapshot.docs[0].id; // User exists, link invite to their UID
         if (finalInviteeUserId === inviterUserId) {
          return { success: false, error: "You cannot invite yourself." };
        }
      }
      // If userSnapshot is empty, it's an invite to a non-existing user by email.
      // finalInviteeUserId will remain undefined, inviteeEmail will be used.
    } else {
        return { success: false, error: "Invitee username or email must be provided."};
    }


    // Check if already a member (if we have a userId)
    if (finalInviteeUserId) {
      const memberCheckRef = doc(firestore, 'CircleMembers', `${circleId}_${finalInviteeUserId}`);
      const memberCheckSnap = await getDoc(memberCheckRef);
      if(memberCheckSnap.exists()) {
          return { success: false, error: "This user is already a member of the circle." };
      }
    }

    // Check for existing pending invite
    let existingInviteQuery;
    if (finalInviteeUserId) {
        existingInviteQuery = query(collection(firestore, 'CircleInvites'), 
            where('circleId', '==', circleId), 
            where('inviteeUserId', '==', finalInviteeUserId),
            where('status', 'in', ['Sent', 'SentToEmail'])
        );
    } else if (finalInviteeEmail) { // User doesn't exist, check by email for SentToEmail status
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


    const newInviteData: Omit<CircleInvite, 'id' | 'dateResponded'> = {
      circleId: circleId,
      circleName: circleName,
      inviterUserId: inviterUserId,
      inviterUsername: inviterUsername,
      inviteeUserId: finalInviteeUserId, // Could be undefined if email-only invite to new user
      inviteeEmail: finalInviteeEmail,   // Will be defined for email invites
      status: finalInviteeUserId ? 'Sent' : 'SentToEmail', // 'SentToEmail' if user doesn't exist yet
      dateSent: serverTimestamp() as any,
    };
    await addDoc(collection(firestore, 'CircleInvites'), newInviteData);

    if (!finalInviteeUserId && finalInviteeEmail) {
      // TODO: IMPORTANT - Implement actual email sending here.
      // Example: sendEmail(inviteeEmail, `You've been invited to ${circleName}`, `Join here: /auth/register?inviteId=${newInviteDoc.id}`);
      console.log(`ACTION REQUIRED: Send email invite to ${finalInviteeEmail} for circle ${circleName}. Include invite ID for linking.`);
    }
    // TODO: Send in-app notification to inviteeUserId if they exist

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
      const inviteSnap = await transaction.get(inviteRef);
      if (!inviteSnap.exists()) throw new Error("Invite not found or has expired.");
      
      const inviteData = inviteSnap.data() as CircleInvite;
      // For invites that were initially email-only, inviteeUserId might now be populated.
      if (inviteData.inviteeUserId && inviteData.inviteeUserId !== payload.inviteeUserId) {
        throw new Error("This invite is not for you.");
      }
      if (inviteData.status !== 'Sent' && inviteData.status !== 'SentToEmail') { // Allow accepting 'SentToEmail' if user ID matches now
          throw new Error("This invite has already been responded to or is no longer valid.");
      }


      transaction.update(inviteRef, { 
        status: payload.responseType,
        dateResponded: serverTimestamp(),
        inviteeUserId: payload.inviteeUserId, // Ensure userId is set on acceptance
      });

      if (payload.responseType === 'Accepted') {
        const circleRef = doc(firestore, 'Circles', inviteData.circleId);
        const circleSnap = await transaction.get(circleRef);
        if(!circleSnap.exists()) throw new Error("The circle no longer exists.");

        const newMemberData: Omit<CircleMember, 'id'> = {
          circleId: inviteData.circleId,
          userId: payload.inviteeUserId,
          username: payload.inviteeUsername,
          role: 'Member',
          dateJoined: serverTimestamp() as any,
        };
        const memberDocRef = doc(firestore, 'CircleMembers', `${inviteData.circleId}_${payload.inviteeUserId}`);
        transaction.set(memberDocRef, newMemberData);
        transaction.update(circleRef, { memberCount: increment(1) });

        const inviterProfileRef = doc(firestore, 'Users', inviteData.inviterUserId);
        transaction.update(inviterProfileRef, { overallPersistentScore: increment(10) });

        return { success: true, circleId: inviteData.circleId };
      }
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
      return { success: true, circleId, error: "You are already a member of this circle." };
    }
    
    const newMemberData: Omit<CircleMember, 'id'> = {
      circleId: circleId,
      userId: payload.userId,
      username: payload.username,
      role: 'Member',
      dateJoined: serverTimestamp() as any,
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
