
'use server';

import { firestore, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp, increment, getDoc as getFirestoreDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { WordSubmission, WordSubmissionStatus, MasterWordType, UserProfile, RejectedWordType, RejectionType } from '@/types';

const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const USERS_COLLECTION = "Users";


export async function adminApproveWordSubmissionAction(payload: { submissionId: string, wordText: string, definition?: string, frequency?: number, submittedByUID: string, puzzleDateGMT: string, moderatorNotes?: string, isWotDClaim?: boolean }): Promise<{ success: boolean; error?: string }> {
    const { submissionId, wordText, definition, frequency, submittedByUID, puzzleDateGMT, moderatorNotes, isWotDClaim } = payload;
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        return { success: false, error: "Authentication Error: You must be logged in to moderate." };
    }

    try {
        const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);
        const wordKey = wordText.toUpperCase();
        const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
        
        const masterWordSnap = await getFirestoreDoc(masterWordDocRef);
        if (masterWordSnap.exists()) {
            // Word already exists, mark submission as duplicate and delete it (or just delete)
            // For single action, we update. For bulk, we might just delete if it's a duplicate.
            // Let's keep the update for now if single action dialog is still used elsewhere.
            await updateDoc(submissionDocRef, {
                status: 'Rejected_Duplicate',
                reviewedByUID: currentUserUID,
                reviewedTimestamp: serverTimestamp(),
                moderatorNotes: `Rejected as duplicate. Word already exists. ${moderatorNotes || ''}`.trim(),
            });
             // It's better to delete from queue after processing in all cases.
            await deleteDoc(submissionDocRef);
            return { success: true, error: "Word already exists in master dictionary. Marked as duplicate." };
        } else {
            const newMasterWord: MasterWordType = {
                wordText: wordKey,
                definition: definition || "No definition provided.",
                frequency: frequency || 1, 
                status: 'Approved',
                addedByUID: currentUserUID,
                dateAdded: serverTimestamp() as Timestamp,
                originalSubmitterUID: submittedByUID,
                puzzleDateGMTOfSubmission: puzzleDateGMT,
            };
            await setDoc(masterWordDocRef, newMasterWord);
            await deleteDoc(submissionDocRef); 
            return { success: true };
        }
    } catch (error: any) {
        console.error("Error approving submission:", error);
        return { success: false, error: `Could not approve submission: ${error.message}` };
    }
}

export async function adminRejectWordSubmissionAction(payload: { submissionId: string, wordText: string, submittedByUID: string, rejectionType: RejectionType }): Promise<{ success: boolean; error?: string }> {
    const { submissionId, wordText, submittedByUID, rejectionType } = payload;
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        return { success: false, error: "Authentication Error: You must be logged in to moderate." };
    }
    
    const wordKey = wordText.toUpperCase();
    const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordKey);
    const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);

    try {
        const newRejectedWord: RejectedWordType = {
            wordText: wordKey,
            rejectionType: rejectionType,
            rejectedByUID: currentUserUID,
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
  submissionsToProcess: BulkSubmissionItem[];
}

export async function adminBulkProcessWordSubmissionsAction(payload: BulkProcessPayload): Promise<{ success: boolean; results: Array<{id: string, status: string, error?: string}>; error?: string }> {
    const currentUserUID = auth.currentUser?.uid;
    if (!currentUserUID) {
        return { success: false, results: [], error: "Authentication Error: You must be logged in to moderate." };
    }

    const batch = writeBatch(firestore);
    const results: Array<{id: string, status: string, error?: string}> = [];

    for (const item of payload.submissionsToProcess) {
        if (item.action === 'noAction') {
            results.push({ id: item.submissionId, status: 'skipped' });
            continue;
        }

        const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, item.submissionId);
        const wordKey = item.wordText.toUpperCase();

        try {
            if (item.action === 'approve') {
                const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
                const masterWordSnap = await getFirestoreDoc(masterWordDocRef); // Needs to be awaited outside batch for read

                if (masterWordSnap.exists()) {
                    // Word already exists, mark original submission as duplicate
                    // For bulk, we might just delete and log, rather than updating the submission that will be deleted anyway.
                    // Let's assume we delete it and report it as a duplicate.
                    batch.delete(submissionDocRef);
                    results.push({ id: item.submissionId, status: 'approved_duplicate_deleted' });
                } else {
                    const newMasterWord: MasterWordType = {
                        wordText: wordKey,
                        definition: item.definition || "No definition provided.",
                        frequency: item.frequency || 1,
                        status: 'Approved',
                        addedByUID: currentUserUID,
                        dateAdded: serverTimestamp() as Timestamp,
                        originalSubmitterUID: item.submittedByUID,
                        puzzleDateGMTOfSubmission: item.puzzleDateGMT,
                    };
                    batch.set(masterWordDocRef, newMasterWord);
                    batch.delete(submissionDocRef);
                    results.push({ id: item.submissionId, status: 'approved' });
                }
            } else if (item.action === 'rejectGibberish' || item.action === 'rejectAdminDecision') {
                const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordKey);
                const newRejectedWord: RejectedWordType = {
                    wordText: wordKey,
                    rejectionType: item.action === 'rejectGibberish' ? 'Gibberish' : 'AdminDecision',
                    rejectedByUID: currentUserUID,
                    dateRejected: serverTimestamp() as Timestamp,
                    originalSubmitterUID: item.submittedByUID,
                };
                batch.set(rejectedWordDocRef, newRejectedWord, { merge: true });
                batch.delete(submissionDocRef);

                if (item.action === 'rejectGibberish') {
                    const userDocRef = doc(firestore, USERS_COLLECTION, item.submittedByUID);
                    // Note: Firestore batch writes cannot depend on previous reads in the same batch for increments.
                    // This increment should ideally happen AFTER the batch commit, or rely on a separate transaction if it must be atomic with user data.
                    // For simplicity here, we'll do it outside the batch or accept it's not perfectly atomic with the batch.
                    // Best practice would be another transaction or a Cloud Function trigger.
                    // For this implementation, we'll update it directly, understanding this limitation.
                    const userSnap = await getFirestoreDoc(userDocRef);
                    if (userSnap.exists()) {
                       const deductionPoints = item.wordText.length;
                       // This update is outside the batch, not ideal for atomicity but simpler for now.
                       await updateDoc(userDocRef, { overallPersistentScore: increment(-deductionPoints) });
                    }
                }
                results.push({ id: item.submissionId, status: `rejected_${item.action}` });
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
        // Add unprocessed items to results with error
        payload.submissionsToProcess.forEach(item => {
            if (!results.find(r => r.id === item.submissionId)) {
                 results.push({ id: item.submissionId, status: 'error_batch_commit', error: error.message });
            }
        });
        return { success: false, results, error: `Batch commit failed: ${error.message}` };
    }
}
