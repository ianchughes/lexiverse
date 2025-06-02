
'use server';

import { firestore, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, Timestamp, increment, getDoc as getFirestoreDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { WordSubmission, WordSubmissionStatus, MasterWordType, UserProfile, RejectedWordType, RejectionType } from '@/types';

const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const USERS_COLLECTION = "Users";


export async function adminApproveWordSubmissionAction(payload: { submissionId: string, wordText: string, definition?: string, frequency?: number, submittedByUID: string, puzzleDateGMT: string, moderatorNotes?: string, isWotDClaim?: boolean, actingAdminId: string }): Promise<{ success: boolean; error?: string }> {
    const { submissionId, wordText, definition, frequency, submittedByUID, puzzleDateGMT, moderatorNotes, isWotDClaim, actingAdminId } = payload;
    
    if (!actingAdminId) {
        return { success: false, error: "Authentication Error: You must be logged in to moderate." };
    }

    try {
        const submissionDocRef = doc(firestore, WORD_SUBMISSIONS_QUEUE, submissionId);
        const wordKey = wordText.toUpperCase();
        const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordKey);
        
        const masterWordSnap = await getFirestoreDoc(masterWordDocRef);
        if (masterWordSnap.exists()) {
            await updateDoc(submissionDocRef, {
                status: 'Rejected_Duplicate',
                reviewedByUID: actingAdminId,
                reviewedTimestamp: serverTimestamp(),
                moderatorNotes: `Rejected as duplicate. Word already exists. ${moderatorNotes || ''}`.trim(),
            });
            await deleteDoc(submissionDocRef);
            return { success: true, error: "Word already exists in master dictionary. Marked as duplicate." };
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
            return { success: true };
        }
    } catch (error: any) {
        console.error("Error approving submission:", error);
        return { success: false, error: `Could not approve submission: ${error.message}` };
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
  actingAdminId: string; // Added actingAdminId
  submissionsToProcess: BulkSubmissionItem[];
}

export async function adminBulkProcessWordSubmissionsAction(payload: BulkProcessPayload): Promise<{ success: boolean; results: Array<{id: string, status: string, error?: string}>; error?: string }> {
    const { actingAdminId, submissionsToProcess } = payload;
    if (!actingAdminId) {
        return { success: false, results: [], error: "Authentication Error: You must be logged in to moderate." };
    }

    const batch = writeBatch(firestore);
    const results: Array<{id: string, status: string, error?: string}> = [];

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
                const masterWordSnap = await getFirestoreDoc(masterWordDocRef); 

                if (masterWordSnap.exists()) {
                    batch.delete(submissionDocRef);
                    results.push({ id: item.submissionId, status: 'approved_duplicate_deleted' });
                } else {
                    const newMasterWord: MasterWordType = {
                        wordText: wordKey,
                        definition: item.definition || "No definition provided.",
                        frequency: item.frequency || 1,
                        status: 'Approved',
                        addedByUID: actingAdminId, // Use actingAdminId
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
                    rejectedByUID: actingAdminId, // Use actingAdminId
                    dateRejected: serverTimestamp() as Timestamp,
                    originalSubmitterUID: item.submittedByUID,
                };
                batch.set(rejectedWordDocRef, newRejectedWord, { merge: true });
                batch.delete(submissionDocRef);

                if (item.action === 'rejectGibberish') {
                    const userDocRef = doc(firestore, USERS_COLLECTION, item.submittedByUID);
                    const userSnap = await getFirestoreDoc(userDocRef);
                    if (userSnap.exists()) {
                       const deductionPoints = item.wordText.length;
                       // This update is outside the batch.
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
        submissionsToProcess.forEach(item => {
            if (!results.find(r => r.id === item.submissionId)) {
                 results.push({ id: item.submissionId, status: 'error_batch_commit', error: error.message });
            }
        });
        return { success: false, results, error: `Batch commit failed: ${error.message}` };
    }
}
