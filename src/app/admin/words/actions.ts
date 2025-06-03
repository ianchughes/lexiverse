
'use server';

import { firestore, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp, increment, getDoc as getFirestoreDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { WordSubmission, WordSubmissionStatus, MasterWordType, UserProfile, RejectedWordType, RejectionType } from '@/types';

const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const USERS_COLLECTION = "Users";


export async function adminApproveWordSubmissionAction(payload: { submissionId: string, wordText: string, definition?: string, frequency?: number, submittedByUID: string, puzzleDateGMT: string, moderatorNotes?: string, isWotDClaim?: boolean, actingAdminId: string }): Promise<{ success: boolean; message?: string; error?: string }> {
    const { submissionId, wordText, definition, frequency, submittedByUID, puzzleDateGMT, moderatorNotes, isWotDClaim, actingAdminId } = payload;
    
    if (!actingAdminId) {
        return { success: false, error: "Authentication Error: You must be logged in to moderate." };
    }

    const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);
    const wordKey = wordText.toUpperCase();
    const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
    
    try {
        const masterWordSnap = await getFirestoreDoc(masterWordDocRef);

        if (masterWordSnap.exists()) {
            const masterWordData = masterWordSnap.data() as MasterWordType;
            if (masterWordData.originalSubmitterUID && masterWordData.originalSubmitterUID !== submittedByUID) {
                // Word exists and IS ALREADY OWNED by someone else. This submission is a duplicate.
                await deleteDoc(submissionDocRef); 
                return { success: true, error: `Word "${wordKey}" already exists and is owned by another user. Submission removed as duplicate.` };
            } else if (masterWordData.originalSubmitterUID && masterWordData.originalSubmitterUID === submittedByUID) {
                // Word exists and is already owned by THIS submitter. Benign duplicate.
                await deleteDoc(submissionDocRef);
                return { success: true, message: `Word "${wordKey}" is already owned by this submitter. Duplicate submission removed.` };
            }
            else {
                // Word exists but is UNCLAIMED (originalSubmitterUID is null). This submission RECLAIMS it.
                await updateDoc(masterWordDocRef, {
                    originalSubmitterUID: submittedByUID,
                    puzzleDateGMTOfSubmission: puzzleDateGMT,
                    addedByUID: actingAdminId, 
                    dateAdded: serverTimestamp(), 
                    definition: definition || masterWordData.definition, 
                    frequency: frequency || masterWordData.frequency,   
                    status: 'Approved', 
                    pendingTransferId: null, // Ensure any old pending transfer is cleared on reclaim
                });
                await deleteDoc(submissionDocRef); 
                return { success: true, message: `Word "${wordKey}" was unclaimed and has now been re-claimed by the submitter.` };
            }
        } else {
            // Word does not exist in Master Dictionary. This is a NEW word.
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
            return { success: true, message: `New word "${wordKey}" approved and added to dictionary.` };
        }
    } catch (error: any) {
        console.error("Error approving submission:", error);
        return { success: false, error: `Could not approve submission for "${wordKey}": ${error.message}` };
    }
}

export async function adminRejectWordSubmissionAction(payload: { submissionId: string, wordText: string, submittedByUID: string, rejectionType: RejectionType, actingAdminId: string }): Promise<{ success: boolean; error?: string }> {
    const { submissionId, wordText, submittedByUID, rejectionType, actingAdminId } = payload;
    if (!actingAdminId) {
        return { success: false, error: "Authentication Error: You must be logged in to moderate." };
    }
    
    const wordKey = wordText.toUpperCase();
    const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordKey);
    const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);

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

        let message = `Word "${wordText}" rejected as ${rejectionType}.`;
        if (rejectionType === 'Gibberish') {
            const userDocRef = doc(firestore, USERS_COLLECTION, submittedByUID);
            const userSnap = await getFirestoreDoc(userDocRef);
            if (userSnap.exists()) {
                const deductionPoints = wordText.length;
                await updateDoc(userDocRef, {
                    overallPersistentScore: increment(-deductionPoints)
                });
                message += ` ${deductionPoints} points deducted from submitter.`;
            }
        }
        return { success: true };
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

    // Pre-fetch all master words that might be relevant to avoid multiple reads of the same doc inside the loop
    const uniqueWordKeysInBatch = new Set(submissionsToProcess.filter(s => s.action === 'approve').map(s => s.wordText.toUpperCase()));
    const masterWordPreFetchPromises: Promise<[string, MasterWordType | null]>[] = [];
    uniqueWordKeysInBatch.forEach(key => {
        const docRef = doc(firestore, MASTER_WORDS_COLLECTION, key);
        masterWordPreFetchPromises.push(getFirestoreDoc(docRef).then(snap => [key, snap.exists() ? snap.data() as MasterWordType : null]));
    });
    const preFetchedMasterWordsArray = await Promise.all(masterWordPreFetchPromises);
    const preFetchedMasterWordsMap = new Map(preFetchedMasterWordsArray);


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
                        // Word exists and is owned by SOMEONE ELSE.
                        batch.delete(submissionDocRef);
                        results.push({ id: item.submissionId, status: 'rejected_duplicate_owned' });
                    } else if (existingMasterWordData.originalSubmitterUID && existingMasterWordData.originalSubmitterUID === item.submittedByUID) {
                        // Word exists and is already owned by THIS submitter.
                        batch.delete(submissionDocRef);
                        results.push({ id: item.submissionId, status: 'rejected_duplicate_self_owned' });
                    } else {
                        // Word exists but is UNCLAIMED (originalSubmitterUID is null). This submission RECLAIMS it.
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
                        // Update our map for subsequent checks in the same batch, if any (though less critical now)
                        preFetchedMasterWordsMap.set(wordKey, {
                            ...existingMasterWordData,
                            originalSubmitterUID: item.submittedByUID,
                            addedByUID: actingAdminId,
                            // dateAdded will be a server timestamp
                        });
                    }
                } else {
                    // Word does not exist - NEW word
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
                     // Update map for subsequent checks
                    preFetchedMasterWordsMap.set(wordKey, newMasterWord);
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

                if (item.action === 'rejectGibberish') {
                    const userDocRef = doc(firestore, USERS_COLLECTION, item.submittedByUID);
                    // Note: Incrementing/decrementing user score in a batch like this for multiple items could lead to race conditions
                    // if not handled carefully or if the user document is frequently updated.
                    // A more robust way for score updates might be a separate cloud function triggered by rejection.
                    // For now, this direct update is kept, but be mindful of potential Firestore limits on batched writes to the same doc.
                    // Since `getFirestoreDoc` was used above (outside the batch), this is fine,
                    // but ideally, score updates should be batched if possible or handled differently for high volume.
                    // For this app's scale, it's likely okay.
                     const userSnap = await getFirestoreDoc(userDocRef); // Read user doc to check existence
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
  wordText: string; // Document ID of the word
  actingAdminId: string;
}

export async function adminDisassociateWordOwnerAction(payload: AdminDisassociateWordOwnerPayload): Promise<{ success: boolean; error?: string }> {
  const { wordText, actingAdminId } = payload;

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
      pendingTransferId: null, // Also clear any pending transfer if disassociating
      // Optionally log admin action here or update a 'lastModifiedByAdmin' field
      // addedByUID: actingAdminId, // Could update to reflect admin made this unowned
      // dateAdded: serverTimestamp(), // Could update to reflect when it became unowned
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error disassociating word owner:", error);
    return { success: false, error: `Could not disassociate owner for "${wordText}": ${error.message}` };
  }
}
