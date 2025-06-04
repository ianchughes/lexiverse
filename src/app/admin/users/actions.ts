
'use server';

import { firestore, auth } from '@/lib/firebase';
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch, runTransaction, increment, getDoc } from 'firebase/firestore';
import type { UserProfile, AdminRoleDoc, UserRole, AccountStatus, MasterWordType, CircleMember, Circle } from '@/types';

interface AdminDeleteUserPayload {
  userIdToDelete: string;
  actingAdminId: string; // For audit logging in a real scenario, and basic permission check
}

export async function adminDeleteUserAndReleaseWordsAction(payload: AdminDeleteUserPayload): Promise<{ success: boolean; error?: string }> {
  const { userIdToDelete, actingAdminId } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Action requires an authenticated admin." };
  }
  // In a real app, you might verify actingAdminId has 'admin' role here.

  if (userIdToDelete === actingAdminId) {
    return { success: false, error: "Administrators cannot delete their own accounts through this panel." };
  }

  const batch = writeBatch(firestore);

  try {
    // 1. Delete user profile
    const userProfileRef = doc(firestore, "Users", userIdToDelete);
    batch.delete(userProfileRef);

    // 2. Delete admin role (if exists)
    const adminRoleRef = doc(firestore, "admin_users", userIdToDelete);
    // Check if doc exists before deleting to avoid error if not an admin/mod
    const adminRoleSnap = await getDoc(adminRoleRef);
    if (adminRoleSnap.exists()) {
        batch.delete(adminRoleRef);
    }

    // 3. Release owned words
    const wordsQuery = query(collection(firestore, "Words"), where("originalSubmitterUID", "==", userIdToDelete));
    const wordsSnapshot = await getDocs(wordsQuery);
    wordsSnapshot.forEach(wordDoc => {
      batch.update(wordDoc.ref, {
        originalSubmitterUID: null,
        puzzleDateGMTOfSubmission: null,
        pendingTransferId: null, // Also cancel any pending transfers for words they owned
      });
    });

    // 4. Remove from all circles and update member counts
    const circleMembershipsQuery = query(collection(firestore, "CircleMembers"), where("userId", "==", userIdToDelete));
    const circleMembershipsSnapshot = await getDocs(circleMembershipsQuery);

    for (const memberDoc of circleMembershipsSnapshot.docs) {
      const memberData = memberDoc.data() as CircleMember;
      const circleRef = doc(firestore, "Circles", memberData.circleId);
      
      // Add member document deletion to batch
      batch.delete(memberDoc.ref);
      // Add circle member count decrement to batch
      // Note: Batch updates for increment are fine. If more complex logic was needed, transaction per circle.
      batch.update(circleRef, { memberCount: increment(-1) });

      // If the user being deleted is the creator of a circle,
      // and there are other members, the circle becomes orphaned.
      // This logic doesn't handle transferring ownership or auto-deleting orphaned circles.
      // That would be a more complex feature.
      const circleSnap = await getDoc(circleRef); // get latest circle data
      if (circleSnap.exists()){
          const circleData = circleSnap.data() as Circle;
          if(circleData.creatorUserID === userIdToDelete && circleData.memberCount -1 > 0) {
              console.warn(`User ${userIdToDelete} was creator of circle ${memberData.circleId}. Circle is now orphaned as no automatic admin transfer is implemented.`);
              // Optionally, update circle status or add an admin note here
              // batch.update(circleRef, { status: 'Orphaned_AdminDeleted' }); // Example status
          } else if (circleData.creatorUserID === userIdToDelete && circleData.memberCount -1 <= 0) {
              // If creator is deleted and they were the last member, delete the circle
              batch.delete(circleRef);
              console.log(`Circle ${memberData.circleId} deleted as its creator and last member ${userIdToDelete} was deleted.`);
          }
      }
    }
    
    // 5. TODO in future: Handle WordTransfers initiated by or to this user (set to 'Cancelled' or 'Expired')
    // 6. TODO in future: Handle CircleInvites sent by or to this user (delete or mark as invalid)

    await batch.commit();
    return { success: true };

  } catch (error: any) {
    console.error("Error in adminDeleteUserAndReleaseWordsAction:", error);
    return { success: false, error: error.message || "Failed to delete user and release words." };
  }
}
