
'use server';

import { firestore, auth } from '@/lib/firebase';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where, 
  writeBatch,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import type { MasterWordType, UserProfile, WordTransfer, WordTransferStatus, AppNotification } from '@/types';

const WORDS_COLLECTION = "Words";
const USERS_COLLECTION = "Users";
const WORD_TRANSFERS_COLLECTION = "WordTransfers";
const NOTIFICATIONS_COLLECTION = "Notifications";

interface InitiateWordTransferPayload {
  wordText: string;
  senderUserId: string; // Should be the currently authenticated user
  senderUsername: string;
  recipientUsername: string;
}

export async function initiateWordTransferAction(payload: InitiateWordTransferPayload): Promise<{ success: boolean; error?: string; transferId?: string }> {
  const { wordText, senderUserId, senderUsername, recipientUsername } = payload;

  if (!senderUserId) {
    return { success: false, error: "Authentication required to initiate transfer." };
  }
  if (senderUsername.toLowerCase() === recipientUsername.toLowerCase()) {
    return { success: false, error: "You cannot transfer a word to yourself." };
  }

  try {
    // 1. Find recipient user by username
    const usersQuery = query(collection(firestore, USERS_COLLECTION), where("username", "==", recipientUsername));
    const usersSnapshot = await getDocs(usersQuery);
    if (usersSnapshot.empty) {
      return { success: false, error: `User "${recipientUsername}" not found.` };
    }
    const recipientUserDoc = usersSnapshot.docs[0];
    const recipientUserId = recipientUserDoc.id;
    const recipientProfile = recipientUserDoc.data() as UserProfile;


    // 2. Verify sender owns the word and no pending transfer exists
    const wordDocRef = doc(firestore, WORDS_COLLECTION, wordText.toUpperCase());
    
    return await runTransaction(firestore, async (transaction) => {
      const wordDocSnap = await transaction.get(wordDocRef);
      if (!wordDocSnap.exists()) {
        throw new Error(`Word "${wordText}" not found in the dictionary.`);
      }
      const wordData = wordDocSnap.data() as MasterWordType;

      if (wordData.originalSubmitterUID !== senderUserId) {
        throw new Error("You do not own this word and cannot transfer it.");
      }
      if (wordData.pendingTransferId) {
         // Check if existing transfer is still valid
        const existingTransferSnap = await transaction.get(doc(firestore, WORD_TRANSFERS_COLLECTION, wordData.pendingTransferId));
        if (existingTransferSnap.exists()) {
            const existingTransferData = existingTransferSnap.data() as WordTransfer;
            if (existingTransferData.status === 'PendingRecipient' && existingTransferData.expiresAt.toMillis() > Date.now()) {
                 throw new Error("This word already has a pending transfer.");
            }
        }
      }

      // 3. Create WordTransfer document
      const transferDocRef = doc(collection(firestore, WORD_TRANSFERS_COLLECTION));
      const now = Timestamp.now();
      const expiresAt = new Timestamp(now.seconds + 24 * 60 * 60, now.nanoseconds); // 24 hours from now

      const newTransfer: WordTransfer = {
        wordText: wordText.toUpperCase(),
        senderUserId,
        senderUsername,
        recipientUserId,
        recipientUsername: recipientProfile.username,
        status: 'PendingRecipient',
        initiatedAt: now,
        expiresAt,
      };
      transaction.set(transferDocRef, newTransfer);

      // 4. Update MasterWordType with pendingTransferId
      transaction.update(wordDocRef, { pendingTransferId: transferDocRef.id });

      // 5. Create notification for recipient
      const recipientNotificationRef = doc(collection(firestore, NOTIFICATIONS_COLLECTION));
      const notificationPayload: Omit<AppNotification, 'id' | 'dateCreated'> = {
        userId: recipientUserId,
        message: `${senderUsername} wants to transfer the word "${wordText.toUpperCase()}" to you.`,
        type: 'WordTransferRequest',
        relatedEntityId: transferDocRef.id,
        isRead: false,
        link: `/notifications`, // Or a dedicated transfers page later
      };
      transaction.set(recipientNotificationRef, { ...notificationPayload, dateCreated: serverTimestamp() as Timestamp });
      
      return { success: true, transferId: transferDocRef.id };
    });

  } catch (error: any) {
    console.error("Error initiating word transfer:", error);
    return { success: false, error: error.message || "Failed to initiate word transfer." };
  }
}


interface RespondToWordTransferPayload {
  transferId: string;
  respondingUserId: string; // Should be the currently authenticated user (recipient)
  response: 'Accepted' | 'Declined';
}

export async function respondToWordTransferAction(payload: RespondToWordTransferPayload): Promise<{ success: boolean; error?: string }> {
  const { transferId, respondingUserId, response } = payload;

  if (!respondingUserId) {
    return { success: false, error: "Authentication required to respond to transfer." };
  }

  const transferDocRef = doc(firestore, WORD_TRANSFERS_COLLECTION, transferId);

  try {
    return await runTransaction(firestore, async (transaction) => {
      const transferDocSnap = await transaction.get(transferDocRef);
      if (!transferDocSnap.exists()) {
        throw new Error("Word transfer request not found or has been cancelled.");
      }
      const transferData = transferDocSnap.data() as WordTransfer;

      if (transferData.recipientUserId !== respondingUserId) {
        throw new Error("You are not authorized to respond to this transfer.");
      }
      if (transferData.status !== 'PendingRecipient') {
        throw new Error(`This transfer is already ${transferData.status.toLowerCase()}.`);
      }
      if (transferData.expiresAt.toMillis() < Date.now()) {
        // Handle expiry implicitly by setting status to 'Expired'
        transaction.update(transferDocRef, { status: 'Expired', respondedAt: serverTimestamp() as Timestamp });
        const wordDocRefExpired = doc(firestore, WORDS_COLLECTION, transferData.wordText);
        transaction.update(wordDocRefExpired, { pendingTransferId: null }); // Clear pending ID
        throw new Error("This transfer request has expired.");
      }

      const wordDocRef = doc(firestore, WORDS_COLLECTION, transferData.wordText);
      const wordDocSnap = await transaction.get(wordDocRef);
      if (!wordDocSnap.exists()) {
        // This case should be rare if transfer was initiated properly
        throw new Error(`The word "${transferData.wordText}" associated with this transfer no longer exists.`);
      }

      let notificationMessageToSender = "";

      if (response === 'Accepted') {
        transaction.update(transferDocRef, { status: 'Accepted', respondedAt: serverTimestamp() as Timestamp });
        transaction.update(wordDocRef, { 
          originalSubmitterUID: transferData.recipientUserId,
          pendingTransferId: null // Clear pending ID
        });
        notificationMessageToSender = `${transferData.recipientUsername} accepted your transfer of the word "${transferData.wordText}".`;
      } else { // Declined
        transaction.update(transferDocRef, { status: 'Declined', respondedAt: serverTimestamp() as Timestamp });
        transaction.update(wordDocRef, { pendingTransferId: null }); // Clear pending ID
        notificationMessageToSender = `${transferData.recipientUsername} declined your transfer of the word "${transferData.wordText}".`;
      }
      
      // Notify sender of the outcome
      const senderNotificationRef = doc(collection(firestore, NOTIFICATIONS_COLLECTION));
      const senderNotifPayload: Omit<AppNotification, 'id' | 'dateCreated'> = {
          userId: transferData.senderUserId,
          message: notificationMessageToSender,
          type: 'WordTransferResult',
          relatedEntityId: transferDocRef.id,
          isRead: false,
          link: `/profile` // Sender might check their profile to see updated ownership
      };
      transaction.set(senderNotificationRef, { ...senderNotifPayload, dateCreated: serverTimestamp() as Timestamp });

      return { success: true };
    });
  } catch (error: any)
   {
    console.error("Error responding to word transfer:", error);
    // If it's an expiry error that we threw, ensure the status is updated if transaction didn't complete it.
    if (error.message === "This transfer request has expired.") {
        try {
            await updateDoc(transferDocRef, { status: 'Expired', respondedAt: serverTimestamp() as Timestamp });
            const transferDataForWordUpdate = (await getDoc(transferDocRef)).data() as WordTransfer | undefined;
            if(transferDataForWordUpdate){
                 const wordDocRefExpired = doc(firestore, WORDS_COLLECTION, transferDataForWordUpdate.wordText);
                 await updateDoc(wordDocRefExpired, { pendingTransferId: null });
            }
        } catch (expiryUpdateError) {
            console.error("Failed to mark as expired after transaction failure:", expiryUpdateError);
        }
    }
    return { success: false, error: error.message || "Failed to respond to word transfer." };
  }
}
