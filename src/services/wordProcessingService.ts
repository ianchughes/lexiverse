
'use server';

import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, Timestamp, writeBatch, query, where, setDoc, getDocs } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth'; // Assuming you pass the full FirebaseUser object or relevant parts
import type { UserProfile, MasterWordType, RejectedWordType, WordSubmission, ClientMasterWordType } from '@/types';
import { calculateWordScore } from '@/lib/scoring';
import { checkWiktionary } from '@/ai/flows/check-wiktionary-flow';

const MASTER_WORDS_COLLECTION = "Words";
const REJECTED_WORDS_COLLECTION = "RejectedWords";
const WORD_SUBMISSIONS_QUEUE = "WordSubmissionsQueue";
const USERS_COLLECTION = "Users";


export interface ProcessWordSubmissionParams {
  wordText: string;
  currentUserId: string;
  currentPuzzleDate: string;
  actualWordOfTheDayText: string | null;
  actualWordOfTheDayDefinition: string | null;
  actualWordOfTheDayPoints: number | null;
}

export interface ProcessedWordResult {
  status: 'success_approved' | 'success_wotd' | 'success_new_unverified' | 'error_api' | 'error_unknown' | 'rejected_gibberish' | 'rejected_admin' | 'rejected_not_found' | 'rejected_already_owned' | 'rejected_already_owned_by_submitter';
  message: string;
  pointsAwarded: number; // Always return points, even if 0 or negative
  isWotD: boolean;
  isNewlyOwned: boolean;
  newlyOwnedWordText?: string;
  updatedMasterWordEntry?: ClientMasterWordType; // Use ClientMasterWordType
}

// Helper to convert Firestore MasterWordType to ClientMasterWordType
const toClientMasterWord = (firestoreWord: MasterWordType): ClientMasterWordType => {
  return {
    ...firestoreWord,
    dateAdded: (firestoreWord.dateAdded as Timestamp).toDate().toISOString(),
  };
};


async function saveWordToSubmissionQueueInternal(
    wordText: string, 
    currentUserId: string, 
    currentPuzzleDate: string, 
    definition?: string, 
    frequency?: number, 
    isWotDClaim: boolean = false
  ): Promise<{success: boolean, message?: string}> {
    const wordUpperCase = wordText.toUpperCase();
    const q = query(
        collection(firestore, WORD_SUBMISSIONS_QUEUE),
        where("wordText", "==", wordUpperCase),
        where("status", "==", "PendingModeratorReview")
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        return {success: false, message: `"${wordUpperCase}" is already pending review.`};
    }
    const newSubmission: Omit<WordSubmission, 'id' | 'submittedTimestamp'> = { 
        wordText: wordUpperCase,
        definition: definition || "No definition provided.",
        frequency: frequency || 3.5, 
        status: 'PendingModeratorReview',
        submittedByUID: currentUserId,
        puzzleDateGMT: currentPuzzleDate,
        isWotDClaim: isWotDClaim, 
    };
    try {
        await addDoc(collection(firestore, WORD_SUBMISSIONS_QUEUE), { ...newSubmission, submittedTimestamp: serverTimestamp() as Timestamp });
        if (definition && !definition.startsWith("Wiktionary check failed")) {
          return {success: true, message: `"${wordText}" has been sent for admin review.`};
        }
        return {success: true, message: `"${wordText}" sent for review (definition pending).`};
    } catch (error) {
        console.error("Error submitting word to queue:", error);
        return {success: false, message: "Could not save your word submission. Please try again."};
    }
}


export async function processWordSubmission(
  params: ProcessWordSubmissionParams
): Promise<ProcessedWordResult> {
  const {
    wordText: rawWordText,
    currentUserId,
    currentPuzzleDate,
    actualWordOfTheDayText,
    actualWordOfTheDayDefinition,
    actualWordOfTheDayPoints,
  } = params;

  const wordText = rawWordText.toUpperCase();

  // 1. WotD Check
  if (actualWordOfTheDayText && wordText === actualWordOfTheDayText.toUpperCase()) {
    const wordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordText);
    const wordSnap = await getDoc(wordDocRef);
    let wotdSessionPoints = 0;
    let newlyClaimedWotD = false;
    let clientSafeUpdatedMasterWordEntry: ClientMasterWordType | undefined = undefined;

    if (wordSnap.exists()) { // WotD is an existing approved word
      const masterWordData = wordSnap.data() as MasterWordType;
      wotdSessionPoints = calculateWordScore(wordText, masterWordData.frequency);
      
      let updatedFirestoreData = { ...masterWordData };
      if (!masterWordData.originalSubmitterUID) {
        updatedFirestoreData = {
            ...masterWordData,
            originalSubmitterUID: currentUserId,
            puzzleDateGMTOfSubmission: currentPuzzleDate,
        };
        await updateDoc(wordDocRef, {
          originalSubmitterUID: currentUserId,
          puzzleDateGMTOfSubmission: currentPuzzleDate,
        });
        newlyClaimedWotD = true;
      } else if (masterWordData.originalSubmitterUID && masterWordData.originalSubmitterUID !== currentUserId) {
        try {
          const claimerProfileRef = doc(firestore, USERS_COLLECTION, masterWordData.originalSubmitterUID);
          await updateDoc(claimerProfileRef, { overallPersistentScore: increment(wotdSessionPoints) });
        } catch (error) { console.error("Error awarding WotD claimer bonus:", error); }
      }
      clientSafeUpdatedMasterWordEntry = toClientMasterWord(updatedFirestoreData);
    } else { // WotD not in master dictionary (should be rare if puzzles are set up correctly)
      wotdSessionPoints = actualWordOfTheDayPoints || calculateWordScore(wordText, 3);
      const definitionForSubmission = actualWordOfTheDayDefinition || `Definition for Word of the Day: ${wordText}`;
      const frequencyForSubmission = actualWordOfTheDayPoints ? Math.max(1, actualWordOfTheDayPoints / Math.max(4, wordText.length)) : 3;
      await saveWordToSubmissionQueueInternal(wordText, currentUserId, currentPuzzleDate, definitionForSubmission, frequencyForSubmission, true);
      // No updatedMasterWordEntry here as it's queued
    }
    return { status: 'success_wotd', message: `Word of the Day "${wordText}" found! Points: ${wotdSessionPoints} (Bonus at end)`, pointsAwarded: wotdSessionPoints, isWotD: true, isNewlyOwned: newlyClaimedWotD, newlyOwnedWordText: newlyClaimedWotD ? wordText : undefined, updatedMasterWordEntry: clientSafeUpdatedMasterWordEntry };
  }

  // 2. Check MasterWords Collection
  const masterWordDocRef = doc(firestore, MASTER_WORDS_COLLECTION, wordText);
  const masterWordSnap = await getDoc(masterWordDocRef);
  if (masterWordSnap.exists()) {
    const masterWordData = masterWordSnap.data() as MasterWordType;
    const points = calculateWordScore(wordText, masterWordData.frequency);
    let newlyClaimedRegularWord = false;
    let updatedFirestoreData = { ...masterWordData };

    if (!masterWordData.originalSubmitterUID) {
      updatedFirestoreData = {
          ...masterWordData,
          originalSubmitterUID: currentUserId,
          puzzleDateGMTOfSubmission: currentPuzzleDate,
      };
      await updateDoc(masterWordDocRef, {
        originalSubmitterUID: currentUserId,
        puzzleDateGMTOfSubmission: currentPuzzleDate,
      });
      newlyClaimedRegularWord = true;
      const clientEntry = toClientMasterWord(updatedFirestoreData);
      return { status: 'success_approved', message: `You own "${wordText}"! Points: ${points}`, pointsAwarded: points, isWotD: false, isNewlyOwned: true, newlyOwnedWordText: wordText, updatedMasterWordEntry: clientEntry };
    } else if (masterWordData.originalSubmitterUID === currentUserId) {
      const clientEntry = toClientMasterWord(masterWordData);
      return { status: 'success_approved', message: `"${wordText}" found! Points: ${points}`, pointsAwarded: points, isWotD: false, isNewlyOwned: false, updatedMasterWordEntry: clientEntry };
    } else { // Owned by someone else
      try {
        const claimerProfileRef = doc(firestore, USERS_COLLECTION, masterWordData.originalSubmitterUID);
        await updateDoc(claimerProfileRef, { overallPersistentScore: increment(points) });
      } catch (error) { console.error("Error awarding claimer bonus:", error); }
      const clientEntry = toClientMasterWord(masterWordData);
      return { status: 'success_approved', message: `"${wordText}" found! Points: ${points}. (Owner bonus given)`, pointsAwarded: points, isWotD: false, isNewlyOwned: false, updatedMasterWordEntry: clientEntry };
    }
  }

  // 3. Check RejectedWords Collection
  const rejectedWordDocRef = doc(firestore, REJECTED_WORDS_COLLECTION, wordText);
  const rejectedWordSnap = await getDoc(rejectedWordDocRef);
  if (rejectedWordSnap.exists()) {
    const rejectedData = rejectedWordSnap.data() as RejectedWordType;
    if (rejectedData.rejectionType === 'Gibberish') {
      const pointsDeducted = calculateWordScore(wordText, 7); // Higher frequency for gibberish = lower score = smaller deduction
      return { status: 'rejected_gibberish', message: `"${wordText}" is not valid. ${pointsDeducted} points deducted.`, pointsAwarded: -pointsDeducted, isWotD: false, isNewlyOwned: false };
    }
    return { status: 'rejected_admin', message: `"${wordText}" is not allowed.`, pointsAwarded: 0, isWotD: false, isNewlyOwned: false };
  }

  // 4. Word not found, use external APIs (WordsAPI/Wiktionary)
  const apiKey = process.env.NEXT_PUBLIC_WORDSAPI_KEY;
  if (!apiKey || apiKey === "YOUR_WORDSAPI_KEY_PLACEHOLDER" || apiKey.length < 10) {
    console.warn("WordsAPI key not configured. Falling back to Wiktionary check.");
    try {
      const wiktionaryResult = await checkWiktionary({ word: wordText });
      if (wiktionaryResult.exists && wiktionaryResult.definition) {
        await saveWordToSubmissionQueueInternal(wordText, currentUserId, currentPuzzleDate, wiktionaryResult.definition, 3.5, false);
        return { status: 'success_new_unverified', message: `"${wordText}" sent for review (from Wiktionary).`, pointsAwarded: 20, isWotD: false, isNewlyOwned: false }; // Award some points for new submission
      } else {
        return { status: 'rejected_not_found', message: `"${wordText}" not found in dictionaries.`, pointsAwarded: 0, isWotD: false, isNewlyOwned: false };
      }
    } catch (wiktionaryError) {
      console.error("Error during Wiktionary check (fallback):", wiktionaryError);
      await saveWordToSubmissionQueueInternal(wordText, currentUserId, currentPuzzleDate, "Wiktionary check failed, requires manual review.", 3.0, false);
      return { status: 'success_new_unverified', message: `"${wordText}" sent for review (Wiktionary error).`, pointsAwarded: 10, isWotD: false, isNewlyOwned: false };
    }
  }

  try {
    const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${wordText.toLowerCase()}`, {
      method: 'GET',
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com' }
    });

    if (response.ok) {
      const data = await response.json();
      const definition = data.results?.[0]?.definition || "No definition provided.";
      let frequency = 3.5;
      if (data.frequencyDetails?.[0]?.zipf) {
        frequency = parseFloat(data.frequencyDetails[0].zipf);
      } else if (data.frequency && typeof data.frequency === 'number') {
        frequency = data.frequency;
      }
      if (isNaN(frequency) || frequency <= 0) frequency = 3.5;
      
      const points = calculateWordScore(wordText, frequency);
      const newMasterWordForFirestore: MasterWordType = { // Type for Firestore
          wordText: wordText, definition, frequency, status: 'Approved',
          addedByUID: currentUserId, dateAdded: serverTimestamp() as Timestamp,
          originalSubmitterUID: currentUserId, puzzleDateGMTOfSubmission: currentPuzzleDate,
      };
      await setDoc(masterWordDocRef, newMasterWordForFirestore);
      
      // For the client, we can't immediately resolve serverTimestamp, so we use current client time for optimistic update
      // Or better, fetch the doc again, but for simplicity for now:
      const clientEntry: ClientMasterWordType = {
        ...newMasterWordForFirestore,
        dateAdded: new Date().toISOString(), // Client-side timestamp for immediate UI
      };
      return { status: 'success_approved', message: `You claimed "${wordText}"! Points: ${points}`, pointsAwarded: points, isWotD: false, isNewlyOwned: true, newlyOwnedWordText: wordText, updatedMasterWordEntry: clientEntry };
    
    } else if (response.status === 404) { // Word not found in WordsAPI, try Wiktionary
      const wiktionaryResult = await checkWiktionary({ word: wordText });
      if (wiktionaryResult.exists && wiktionaryResult.definition) {
        await saveWordToSubmissionQueueInternal(wordText, currentUserId, currentPuzzleDate, wiktionaryResult.definition, 3.5, false);
        return { status: 'success_new_unverified', message: `"${wordText}" sent for review (from Wiktionary).`, pointsAwarded: 20, isWotD: false, isNewlyOwned: false };
      } else {
        return { status: 'rejected_not_found', message: `"${wordText}" not found in dictionaries.`, pointsAwarded: 0, isWotD: false, isNewlyOwned: false };
      }
    } else { // API error from WordsAPI
      return { status: 'error_api', message: `Could not verify "${wordText}" (API error).`, pointsAwarded: 0, isWotD: false, isNewlyOwned: false };
    }
  } catch (error: any) {
     return { status: 'error_unknown', message: `${error.message || `Could not verify "${wordText}"`}.`, pointsAwarded: 0, isWotD: false, isNewlyOwned: false };
  }
}


