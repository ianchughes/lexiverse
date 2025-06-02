
'use server';

import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, writeBatch, query, where, getDocs, updateDoc, deleteDoc, runTransaction, increment } from 'firebase/firestore';
import type { Circle, CircleMember, CircleInvite } from '@/types';
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
    // Server-side validation (e.g., profanity, more robust uniqueness if needed)
    if (!payload.circleName.trim()) {
      return { success: false, error: "Circle name cannot be empty." };
    }
    // Basic check for existing name (case-insensitive for this example, could be stricter)
    const nameQuery = query(collection(firestore, 'Circles'), where('circleNameLower', '==', payload.circleName.toLowerCase()));
    const nameSnap = await getDocs(nameQuery);
    if (!nameSnap.empty) {
      return { success: false, error: `Circle name "${payload.circleName}" is already taken.` };
    }

    const newCircleRef = doc(collection(firestore, 'Circles'));
    const inviteLinkCode = nanoid(8); // Generate a unique 8-char invite code

    const newCircleData: Omit<Circle, 'id'> = {
      circleName: payload.circleName,
      circleNameLower: payload.circleName.toLowerCase(), // For case-insensitive queries
      creatorUserID: payload.creatorUserID,
      dateCreated: serverTimestamp() as any, // Cast for TS
      status: 'Active',
      isPublic: payload.isPublic,
      publicDescription: payload.publicDescription,
      // publicTags: payload.tags,
      inviteLinkCode: inviteLinkCode,
      memberCount: 1, // Creator is the first member
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

        // Auth check: only creator or admin can amend
        if (circleData.creatorUserID !== payload.requestingUserId) {
             // More robust: Check CircleMembers for Admin role
            const memberQuery = query(collection(firestore, 'CircleMembers'), 
                where('circleId', '==', payload.circleId), 
                where('userId', '==', payload.requestingUserId),
                where('role', '==', 'Admin'));
            const memberSnap = await getDocs(memberQuery);
            if (memberSnap.empty) {
                return { success: false, error: "You don't have permission to edit this circle." };
            }
        }
        
        // If name changed, check uniqueness (excluding current circle)
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
            // Potentially update a 'lastModified' timestamp
        });

        return { success: true };

    } catch (error: any) {
        console.error("Error in amendCircleDetailsAction:", error);
        return { success: false, error: error.message || "Failed to update circle." };
    }
}

interface CircleActionPayload {
    circleId: string;
    userId: string; // User performing the action
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
            
            // Prevent creator/sole admin from leaving without deleting or appointing new admin (simplified here)
            if (circleData.creatorUserID === payload.userId && circleData.memberCount <= 1) {
                throw new Error("As the sole admin/creator, you must delete the circle or appoint another admin before leaving.");
            }

            transaction.delete(memberRef);
            transaction.update(circleRef, { memberCount: increment(-1) });
        });
        
        // TODO: If user was admin and last admin, potentially reassign admin role or handle orphaned circle.

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
        // Auth check: only creator or circle admin
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

        // In a real app, might set status to 'Deleted_ByUser' and have cleanup functions
        // For now, direct delete of circle and its members (batched)
        const batch = writeBatch(firestore);
        batch.delete(circleRef);

        const membersQuery = query(collection(firestore, 'CircleMembers'), where('circleId', '==', payload.circleId));
        const membersSnap = await getDocs(membersQuery);
        membersSnap.forEach(doc => batch.delete(doc.ref));
        
        // Also delete invites, scores etc. (omitted for brevity here, but important for production)

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
  inviteeUserId: string;
}

export async function sendCircleInviteAction(payload: SendCircleInvitePayload): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify inviter is admin (simplified check here, more robust would check CircleMembers)
    const circleDoc = await getDoc(doc(firestore, 'Circles', payload.circleId));
    if (!circleDoc.exists() || (circleDoc.data() as Circle).creatorUserID !== payload.inviterUserId) {
      // Add check for CircleMember role 'Admin' for non-creators
      const memberQuery = query(collection(firestore, 'CircleMembers'), 
        where('circleId', '==', payload.circleId), 
        where('userId', '==', payload.inviterUserId),
        where('role', '==', 'Admin'));
      const memberSnap = await getDocs(memberQuery);
      if (memberSnap.empty && (circleDoc.data() as Circle).creatorUserID !== payload.inviterUserId) {
        return { success: false, error: "You don't have permission to invite members to this circle." };
      }
    }

    // Check if invitee is already a member
    const memberCheckRef = doc(firestore, 'CircleMembers', `${payload.circleId}_${payload.inviteeUserId}`);
    const memberCheckSnap = await getDoc(memberCheckRef);
    if(memberCheckSnap.exists()) {
        return { success: false, error: "This user is already a member of the circle." };
    }

    // Check for existing pending invite
    const existingInviteQuery = query(collection(firestore, 'CircleInvites'), 
        where('circleId', '==', payload.circleId), 
        where('inviteeUserId', '==', payload.inviteeUserId),
        where('status', '==', 'Sent')
    );
    const existingInviteSnap = await getDocs(existingInviteQuery);
    if (!existingInviteSnap.empty) {
        return { success: false, error: "An invite has already been sent to this user for this circle." };
    }


    const newInviteData: Omit<CircleInvite, 'id' | 'dateResponded'> = {
      circleId: payload.circleId,
      circleName: payload.circleName,
      inviterUserId: payload.inviterUserId,
      inviterUsername: payload.inviterUsername,
      inviteeUserId: payload.inviteeUserId,
      status: 'Sent',
      dateSent: serverTimestamp() as any,
    };
    await addDoc(collection(firestore, 'CircleInvites'), newInviteData);

    // TODO: Send in-app notification to inviteeUserId

    return { success: true };
  } catch (error: any) {
    console.error("Error in sendCircleInviteAction:", error);
    return { success: false, error: error.message || "Failed to send invite." };
  }
}

interface RespondToCircleInvitePayload {
  inviteId: string;
  inviteeUserId: string; // Current user
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
      if (inviteData.inviteeUserId !== payload.inviteeUserId) throw new Error("This invite is not for you.");
      if (inviteData.status !== 'Sent') throw new Error("This invite has already been responded to or is no longer valid.");

      transaction.update(inviteRef, { 
        status: payload.responseType,
        dateResponded: serverTimestamp(),
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

        // TODO: Trigger "Circle Growth Bonus"
        // 1. Award bonus to InviterUserID's OverallPersistentScore
        const inviterProfileRef = doc(firestore, 'Users', inviteData.inviterUserId);
        transaction.update(inviterProfileRef, { overallPersistentScore: increment(10) }); // Example: 10 points bonus

        // 2. Award bonus to Circle's score (e.g., weekly or a temp buffer) - complex, might need separate handling

        // TODO: Send notification to Circle Admin/Creator
        // TODO: Send "Welcome & Introduce" nudge to new member
        return { success: true, circleId: inviteData.circleId };
      }
      return { success: true }; // For 'Declined'
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
    const circleDoc = circlesSnap.docs[0]; // Assuming invite codes are unique
    const circleData = circleDoc.data() as Circle;
    const circleId = circleDoc.id;

    if (circleData.status !== 'Active') {
      return { success: false, error: "This circle is currently not active or accepting new members." };
    }

    // Check if user is already a member
    const memberRef = doc(firestore, 'CircleMembers', `${circleId}_${payload.userId}`);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) {
      return { success: true, circleId, error: "You are already a member of this circle." }; // Still success, redirect
    }
    
    // Add member
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

    // TODO: "Circle Growth Bonus" (if applicable for code joins)
    // TODO: Send "Welcome & Introduce" nudge

    return { success: true, circleId: circleId };

  } catch (error: any) {
    console.error("Error in joinCircleWithInviteCodeAction:", error);
    return { success: false, error: error.message || "Failed to join circle with code." };
  }
}

interface UpdateUserDailyCircleScorePayload {
  userId: string;
  puzzleDateGMT: string; // YYYY-MM-DD
  finalDailyScore: number;
}

export async function updateUserCircleDailyScoresAction(payload: UpdateUserDailyCircleScorePayload): Promise<{ success: boolean; error?: string }> {
  try {
    // Find all circles the user is a member of
    const memberQuery = query(collection(firestore, 'CircleMembers'), where('userId', '==', payload.userId));
    const memberSnap = await getDocs(memberQuery);

    if (memberSnap.empty) return { success: true }; // User is not in any circles

    const batch = writeBatch(firestore);

    memberSnap.forEach(memberDoc => {
      const circleId = memberDoc.data().circleId;
      const dailyScoreDocId = `${payload.puzzleDateGMT}_${circleId}`;
      const dailyScoreRef = doc(firestore, 'CircleDailyScores', dailyScoreDocId);
      
      // Using set with merge:true to create if not exists, or update if exists
      // However, increment requires the doc to exist, so this needs careful handling or a transaction per circle.
      // For simplicity, we'll assume a transaction for each or that docs are pre-created.
      // A more robust way: runTransaction for each circle score update.
      // Here, we'll try to update, if it fails (doc doesn't exist for increment), it's an issue.
      // This is a simplification. Production might use onWrite triggers or dedicated aggregation.
      batch.set(dailyScoreRef, { 
        dailyTotalScore: increment(payload.finalDailyScore),
        puzzleDateGMT: payload.puzzleDateGMT, // Ensure these fields are set on creation
        circleId: circleId,
      }, { merge: true }); // Creates if not exist, then increments (if field exists)
                           // Firestore increment creates the field if it doesn't exist on an existing doc.
                           // If doc doesn't exist, set with merge:true then update might be needed.
                           // A transaction is safer for read-modify-write.
                           // The current batch.set with increment and merge should effectively create or update.
    });

    await batch.commit();
    return { success: true };

  } catch (error: any) {
    console.error("Error in updateUserCircleDailyScoresAction:", error);
    return { success: false, error: error.message || "Failed to update circle daily scores." };
  }
}
// Placeholder for admin actions for circles - to be expanded in src/app/admin/circles/actions.ts
// e.g., adminAmendCircleAction, adminBarCircleAction etc.

