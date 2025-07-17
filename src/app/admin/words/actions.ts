
'use server';

import { firestore } from '@/lib/firebase'; // auth removed
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp, increment, getDoc as getFirestoreDoc, deleteDoc, writeBatch, addDoc, runTransaction } from 'firebase/firestore';
import type { WordSubmission, MasterWordType, UserProfile, RejectedWordType, RejectionType, WordGift, AppNotification } from '@/types';
import { logAdminAction } from '@/lib/auditLogger';

const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const USERS_COLLECTION = "Users";
const WORD_GIFTS_COLLECTION = "WordGifts";
const MAIL_COLLECTION = "mail";
const NOTIFICATIONS_COLLECTION = "Notifications";


export async function adminApproveWordSubmissionAction(payload: { submissionId: string, wordText: string, definition?: string, frequency?: number, submittedByUID: string, puzzleDateGMT: string, moderatorNotes?: string, isWotDClaim?: boolean, actingAdminId: string }): Promise<{ success: boolean; message?: string; error?: string }> {
    const { submissionId, wordText, definition, frequency, submittedByUID, puzzleDateGMT, moderatorNotes, isWotDClaim, actingAdminId } = payload;
    
    if (!actingAdminId) {
        return { success: false, error: "Authentication Error: You must be logged in to moderate." };
    }

    const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);
    const wordKey = wordText.toUpperCase();
    const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
    let actionMessage = "";
    
    try {
        const masterWordSnap = await getFirestoreDoc(masterWordDocRef);

        if (masterWordSnap.exists()) {
            const masterWordData = masterWordSnap.data() as MasterWordType;
            if (masterWordData.originalSubmitterUID && masterWordData.originalSubmitterUID !== submittedByUID) {
                await deleteDoc(submissionDocRef); 
                actionMessage = `Word "${wordKey}" already exists and is owned by another user. Submission removed as duplicate.`;
            } else if (masterWordData.originalSubmitterUID && masterWordData.originalSubmitterUID === submittedByUID) {
                await deleteDoc(submissionDocRef);
                actionMessage = `Word "${wordKey}" is already owned by this submitter. Duplicate submission removed.`;
            }
            else {
                await updateDoc(masterWordDocRef, {
                    originalSubmitterUID: submittedByUID,
                    puzzleDateGMTOfSubmission: puzzleDateGMT,
                    addedByUID: actingAdminId, 
                    dateAdded: serverTimestamp(), 
                    definition: definition || masterWordData.definition, 
                    frequency: frequency || masterWordData.frequency,   
                    status: 'Approved', 
                    pendingTransferId: null,
                });
                await deleteDoc(submissionDocRef); 
                actionMessage = `Word "${wordKey}" was unclaimed and has now been re-claimed by the submitter.`;
            }
        } else {
            const newMasterWord: MasterWordType = {
                wordText: wordKey,
                definition: definition || "No definition provided.",
                frequency: frequency || 1, 
                status: 'Approved',
                addedByUID: actingAdminId,
                dateAdded: serverTimestamp() as Timestamp,
                originalSubmitterUID: submittedByUID,
                puzzleDateGMTOfSubmission: puzzleDateGMT,
            };
            await setDoc(masterWordDocRef, newMasterWord);
            await deleteDoc(submissionDocRef); 
            actionMessage = `New word "${wordKey}" approved and added to dictionary.`;
        }

        await logAdminAction({
            actingAdminId,
            actionType: 'WORD_SUBMISSION_APPROVE',
            targetEntityType: 'Word',
            targetEntityId: wordKey,
            targetEntityDisplay: wordKey,
            details: actionMessage,
        });
        return { success: true, message: actionMessage };

    } catch (error: any) {
        console.error("Error approving submission:", error);
        return { success: false, error: `Could not approve submission for "${wordKey}": ${error.message}` };
    }
}

export async function adminRejectWordSubmissionAction(payload: { submissionId: string, wordText: string, submittedByUID: string, rejectionType: RejectionType, actingAdminId: string }): Promise<{ success: boolean; error?: string, message?:string }> {
    const { submissionId, wordText, submittedByUID, rejectionType, actingAdminId } = payload;
    if (!actingAdminId) {
        return { success: false, error: "Authentication Error: You must be logged in to moderate." };
    }
    
    const wordKey = wordText.toUpperCase();
    const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordKey);
    const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);
    let message = "";

    try {
        const newRejectedWord: RejectedWordType = {
            wordText: wordKey,
            rejectionType: rejectionType,
            rejectedByUID: actingAdminId,
            dateRejected: serverTimestamp() as Timestamp,
            originalSubmitterUID: submittedByUID,
        };
        await setDoc(rejectedWordDocRef, newRejectedWord, { merge: true }); 
        await deleteDoc(submissionDocRef);

        message = `Word "${wordText}" rejected as ${rejectionType}.`;
        if (rejectionType === 'Gibberish') {
            const userDocRef = doc(firestore, USERS_COLLECTION, submittedByUID);
            const userSnap = await getFirestoreDoc(userDocRef);
            if (userSnap.exists()) {
                const deductionPoints = wordText.length;
                await updateDoc(userDocRef, { overallPersistentScore: increment(-deductionPoints) });
                message += ` ${deductionPoints} points deducted from submitter.`;
            }
        }
        
        await logAdminAction({
            actingAdminId,
            actionType: 'WORD_SUBMISSION_REJECT',
            targetEntityType: 'Word',
            targetEntityId: wordKey,
            targetEntityDisplay: wordKey,
            details: message,
        });
        return { success: true, message };
    } catch (error: any) {
        console.error("Error rejecting submission:", error);
        return { success: false, error: `Could not reject submission: ${error.message}` };
    }
}


interface BulkSubmissionItem {
  submissionId: string;
  wordText: string;
  definition?: string;
  frequency?: number;
  submittedByUID: string;
  puzzleDateGMT: string;
  action: 'approve' | 'rejectGibberish' | 'rejectAdminDecision' | 'noAction';
  isWotDClaim?: boolean;
}

interface BulkProcessPayload {
  actingAdminId: string;
  submissionsToProcess: BulkSubmissionItem[];
}

export async function adminBulkProcessWordSubmissionsAction(payload: BulkProcessPayload): Promise<{ success: boolean; results: Array<{id: string, status: string, error?: string}>; error?: string }> {
    const { actingAdminId, submissionsToProcess } = payload;
    if (!actingAdminId) {
        return { success: false, results: [], error: "Authentication Error: You must be logged in to moderate." };
    }

    const batch = writeBatch(firestore);
    const results: Array<{id: string, status: string, error?: string}> = [];
    let approvedCount = 0;
    let rejectedCount = 0;
    let preFetchedMasterWordsMap: Map<string, MasterWordType | null>;

    try {
        const uniqueWordKeysInBatch = new Set(submissionsToProcess.filter(s => s.action === 'approve').map(s => s.wordText.toUpperCase()));
        if (uniqueWordKeysInBatch.size > 0) {
            const masterWordPreFetchPromises: Promise<[string, MasterWordType | null]>[] = [];
            uniqueWordKeysInBatch.forEach(key => {
                const docRef = doc(firestore, MASTER_WORDS_COLLECTION, key);
                masterWordPreFetchPromises.push(getFirestoreDoc(docRef).then(snap => [key, snap.exists() ? snap.data() as MasterWordType : null]));
            });
            const preFetchedMasterWordsArray = await Promise.all(masterWordPreFetchPromises);
            preFetchedMasterWordsMap = new Map(preFetchedMasterWordsArray);
        } else {
            preFetchedMasterWordsMap = new Map();
        }
    } catch (error: any) {
        console.error("Error pre-fetching master words in bulk action:", error);
        return { success: false, results: [], error: "Failed to pre-fetch word data. Please try again." };
    }


    for (const item of submissionsToProcess) {
        if (item.action === 'noAction') {
            results.push({ id: item.submissionId, status: 'skipped' });
            continue;
        }

        const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, item.submissionId);
        const wordKey = item.wordText.toUpperCase();

        try {
            if (item.action === 'approve') {
                const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
                const existingMasterWordData = preFetchedMasterWordsMap.get(wordKey);

                if (existingMasterWordData) {
                    if (existingMasterWordData.originalSubmitterUID && existingMasterWordData.originalSubmitterUID !== item.submittedByUID) {
                        batch.delete(submissionDocRef);
                        results.push({ id: item.submissionId, status: 'rejected_duplicate_owned', error: 'Word already owned by another user.' });
                        rejectedCount++;
                    } else if (existingMasterWordData.originalSubmitterUID && existingMasterWordData.originalSubmitterUID === item.submittedByUID) {
                        batch.delete(submissionDocRef);
                        results.push({ id: item.submissionId, status: 'rejected_duplicate_self_owned', error: 'Word already owned by this submitter.' });
                        rejectedCount++;
                    } else {
                        batch.update(masterWordDocRef, {
                            originalSubmitterUID: item.submittedByUID,
                            puzzleDateGMTOfSubmission: item.puzzleDateGMT,
                            addedByUID: actingAdminId, 
                            dateAdded: serverTimestamp(), 
                            definition: item.definition || existingMasterWordData.definition,
                            frequency: item.frequency || existingMasterWordData.frequency,
                            status: 'Approved',
                            pendingTransferId: null,
                        });
                        batch.delete(submissionDocRef);
                        results.push({ id: item.submissionId, status: 'approved_reclaimed' });
                        preFetchedMasterWordsMap.set(wordKey, {
                            ...existingMasterWordData,
                            originalSubmitterUID: item.submittedByUID,
                            addedByUID: actingAdminId,
                        } as MasterWordType); // Cast here
                        approvedCount++;
                    }
                } else {
                    const newMasterWord: MasterWordType = {
                        wordText: wordKey,
                        definition: item.definition || "No definition provided.",
                        frequency: item.frequency || 1,
                        status: 'Approved',
                        addedByUID: actingAdminId, 
                        dateAdded: serverTimestamp() as Timestamp,
                        originalSubmitterUID: item.submittedByUID,
                        puzzleDateGMTOfSubmission: item.puzzleDateGMT,
                    };
                    batch.set(masterWordDocRef, newMasterWord);
                    batch.delete(submissionDocRef);
                    results.push({ id: item.submissionId, status: 'approved_new' });
                    preFetchedMasterWordsMap.set(wordKey, newMasterWord);
                    approvedCount++;
                }
            } else if (item.action === 'rejectGibberish' || item.action === 'rejectAdminDecision') {
                const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordKey);
                const newRejectedWord: RejectedWordType = {
                    wordText: wordKey,
                    rejectionType: item.action === 'rejectGibberish' ? 'Gibberish' : 'AdminDecision',
                    rejectedByUID: actingAdminId, 
                    dateRejected: serverTimestamp() as Timestamp,
                    originalSubmitterUID: item.submittedByUID,
                };
                batch.set(rejectedWordDocRef, newRejectedWord, { merge: true });
                batch.delete(submissionDocRef);
                results.push({ id: item.submissionId, status: `rejected_${item.action === 'rejectGibberish' ? 'gibberish' : 'admin_decision'}` });
                rejectedCount++;

                if (item.action === 'rejectGibberish') {
                    const userDocRef = doc(firestore, USERS_COLLECTION, item.submittedByUID);
                     const userSnap = await getFirestoreDoc(userDocRef); // This needs to be outside batch or handled differently
                     if (userSnap.exists()) {
                       const deductionPoints = item.wordText.length;
                       batch.update(userDocRef, { overallPersistentScore: increment(-deductionPoints) });
                     }
                }
            }
        } catch (e: any) {
            results.push({ id: item.submissionId, status: 'error', error: e.message });
        }
    }

    try {
        await batch.commit();
        await logAdminAction({
            actingAdminId,
            actionType: 'WORD_SUBMISSION_BULK_PROCESS',
            details: `Bulk processed: ${approvedCount} approved, ${rejectedCount} rejected. Total items: ${submissionsToProcess.filter(s => s.action !== 'noAction').length}.`,
        });
        return { success: true, results };
    } catch (error: any) {
        console.error("Error committing bulk word processing batch:", error);
        submissionsToProcess.forEach(item => {
            if (!results.find(r => r.id === item.submissionId)) {
                 results.push({ id: item.submissionId, status: 'error_batch_commit', error: error.message });
            }
        });
        return { success: false, results, error: `Batch commit failed: ${error.message}` };
    }
}


interface AdminDisassociateWordOwnerPayload {
  wordText: string; 
  actingAdminId: string;
  originalOwnerUID?: string; // For logging
}

export async function adminDisassociateWordOwnerAction(payload: AdminDisassociateWordOwnerPayload): Promise<{ success: boolean; error?: string }> {
  const { wordText, actingAdminId, originalOwnerUID } = payload;

  if (!actingAdminId) {
    return { success: false, error: "Authentication Error: Admin ID is required." };
  }

  const wordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordText.toUpperCase());

  try {
    const wordSnap = await getFirestoreDoc(wordDocRef);
    if (!wordSnap.exists()) {
      return { success: false, error: "Word not found in Master Dictionary." };
    }

    await updateDoc(wordDocRef, {
      originalSubmitterUID: null,
      puzzleDateGMTOfSubmission: null,
      pendingTransferId: null, 
    });

    await logAdminAction({
        actingAdminId,
        actionType: 'WORD_OWNER_DISASSOCIATE',
        targetEntityType: 'Word',
        targetEntityId: wordText.toUpperCase(),
        targetEntityDisplay: wordText.toUpperCase(),
        details: `Owner disassociated from word. Original owner UID (if known): ${originalOwnerUID || 'N/A'}.`,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error disassociating word owner:", error);
    return { success: false, error: `Could not disassociate owner for "${wordText}": ${error.message}` };
  }
}

interface AdminBulkDisassociateWordOwnersPayload {
  wordTexts: string[];
  actingAdminId: string;
}

export async function adminBulkDisassociateWordOwnersAction(payload: AdminBulkDisassociateWordOwnersPayload): Promise<{ success: boolean; results: Array<{ wordText: string, status: 'disassociated' | 'not_found' | 'error', error?: string }>; error?: string }> {
  const { wordTexts, actingAdminId } = payload;
  if (!actingAdminId) {
    return { success: false, results: [], error: "Authentication Error: Admin ID is required." };
  }

  if (!wordTexts || wordTexts.length === 0) {
    return { success: false, results: [], error: "No words selected for disassociation." };
  }

  const batch = writeBatch(firestore);
  const results: Array<{ wordText: string, status: 'disassociated' | 'not_found' | 'error', error?: string }> = [];

  for (const wordText of wordTexts) {
    const wordKey = wordText.toUpperCase();
    const wordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
    batch.update(wordDocRef, {
      originalSubmitterUID: null,
      puzzleDateGMTOfSubmission: null,
      pendingTransferId: null,
    });
  }

  try {
    await batch.commit();
    wordTexts.forEach(wt => results.push({ wordText: wt, status: 'disassociated' }));
    
    await logAdminAction({
        actingAdminId,
        actionType: 'WORD_OWNER_BULK_DISASSOCIATE',
        details: `Bulk disassociated owners for ${wordTexts.length} words: ${wordTexts.join(', ')}.`,
    });
    return { success: true, results };
  } catch (error: any) {
    console.error("Error committing bulk word disassociation batch:", error);
    wordTexts.forEach(wt => {
        if (!results.find(r => r.wordText === wt)) {
            results.push({ wordText: wt, status: 'error', error: error.message });
        }
    });
    return { success: false, results, error: `Bulk disassociation failed: ${error.message}` };
  }
}

interface AdminGiftWordPayload {
    wordText: string;
    actingAdminId: string;
    recipientUsername: string;
}

export async function adminGiftWordToUserAction(payload: AdminGiftWordPayload): Promise<{ success: boolean; error?: string }> {
    const { wordText, actingAdminId, recipientUsername } = payload;

    if (!actingAdminId) return { success: false, error: "Authentication required." };
    if (!wordText || !recipientUsername) return { success: false, error: "Word and recipient username are required." };

    const wordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordText.toUpperCase());
    const usersQuery = query(collection(firestore, USERS_COLLECTION), where("username", "==", recipientUsername));
    
    try {
        const wordSnap = await getFirestoreDoc(wordDocRef);
        if (!wordSnap.exists()) {
            return { success: false, error: `Word "${wordText}" does not exist in the master dictionary.` };
        }
        if (wordSnap.data().originalSubmitterUID) {
            return { success: false, error: `Word "${wordText}" is already owned.` };
        }

        const userSnap = await getDocs(usersQuery);
        if (userSnap.empty) {
            return { success: false, error: `User "${recipientUsername}" not found.` };
        }
        const recipientUserDoc = userSnap.docs[0];
        const recipientUserId = recipientUserDoc.id;
        const recipientEmail = recipientUserDoc.data().email;

        const giftDocRef = doc(collection(firestore, WORD_GIFTS_COLLECTION));
        const now = Timestamp.now();
        const expiresAt = new Timestamp(now.seconds + 7 * 24 * 60 * 60, now.nanoseconds); // 7 days expiry

        const newGift: WordGift = {
            id: giftDocRef.id,
            wordText: wordText.toUpperCase(),
            giftedByAdminId: actingAdminId,
            recipientUserId: recipientUserId,
            recipientUsername: recipientUsername,
            status: 'PendingClaim',
            initiatedAt: now,
            expiresAt: expiresAt,
        };
        
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const claimLink = `${appUrl}/claim-word/${giftDocRef.id}`;
        
        const emailContent = {
            to: [recipientEmail],
            message: {
                subject: "Wow! You just got given a word",
                html: `<p>Thanks for playing Lexiverse, as one of our early adopters we want to get you earning points as soon as possible so we are giving you a word. Yes, that's right you will own this word and every time someone uses it in future you will get points. All you have to do to claim this word is click on this link: <a href="${claimLink}">${claimLink}</a></p>`,
            },
            createdTimestamp: serverTimestamp(),
        };
        
        const batch = writeBatch(firestore);
        batch.set(giftDocRef, newGift);
        batch.set(doc(collection(firestore, MAIL_COLLECTION)), emailContent);

        await batch.commit();

        await logAdminAction({
            actingAdminId,
            actionType: 'WORD_GIFT_TO_USER',
            targetEntityType: 'User',
            targetEntityId: recipientUserId,
            targetEntityDisplay: recipientUsername,
            details: `Gifted word "${wordText.toUpperCase()}" to user.`,
        });

        return { success: true };

    } catch (error: any) {
        console.error("Error gifting word:", error);
        return { success: false, error: error.message || "An unexpected error occurred." };
    }
}
