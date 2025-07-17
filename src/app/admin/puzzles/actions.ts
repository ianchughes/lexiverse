
'use server';

import { firestore } from '@/lib/firebase';
import { doc, setDoc, getDoc, Timestamp, collection, getDocs, deleteDoc, updateDoc, query, orderBy, writeBatch, serverTimestamp, where } from 'firebase/firestore';
import type { DailyPuzzle, AdminPuzzleFormState, ClientPuzzleSuggestion, GeneratePuzzleSuggestionsOutput } from '@/types';
import { format, addDays, startOfTomorrow } from 'date-fns';
import { logAdminAction } from '@/lib/auditLogger';

const DAILY_PUZZLES_COLLECTION = "DailyPuzzles";

interface AdminCreatePuzzlePayload {
  puzzleData: AdminPuzzleFormState;
  actingAdminId: string;
}
export async function adminCreateDailyPuzzleAction(payload: AdminCreatePuzzlePayload): Promise<{ success: boolean; puzzle?: DailyPuzzle; error?: string }> {
  const { puzzleData, actingAdminId } = payload;
  try {
    if (!puzzleData.puzzleDateGMT) {
      return { success: false, error: "Puzzle date is required." };
    }
    const docId = format(puzzleData.puzzleDateGMT, 'yyyy-MM-dd');
    const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, docId);

    const docSnap = await getDoc(puzzleDocRef);
    if (docSnap.exists()) {
      return { success: false, error: `A puzzle already exists for ${docId}. Please edit the existing one or choose a different date.` };
    }
    
    // WotD uniqueness check should be done client-side before calling this, or add a check here if needed.

    const newPuzzleForFirestore = {
      id: docId,
      wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
      wordOfTheDayPoints: puzzleData.wordOfTheDayPoints,
      seedingLetters: puzzleData.seedingLetters.toUpperCase(),
      status: puzzleData.status,
      puzzleDateGMT: Timestamp.fromDate(puzzleData.puzzleDateGMT),
      wordOfTheDayDefinition: puzzleData.wordOfTheDayDefinition || "No definition provided by admin.",
    };

    await setDoc(puzzleDocRef, newPuzzleForFirestore);

    await logAdminAction({
      actingAdminId,
      actionType: 'PUZZLE_CREATE',
      targetEntityType: 'Puzzle',
      targetEntityId: docId,
      targetEntityDisplay: `Puzzle for ${docId}`,
      details: `Created puzzle with WotD: ${puzzleData.wordOfTheDayText}`,
    });

    const createdPuzzle: DailyPuzzle = {
      id: docId,
      ...puzzleData, // puzzleDateGMT here is still a Date object from AdminPuzzleFormState
      puzzleDateGMT: puzzleData.puzzleDateGMT, // Ensure this remains a Date object for the return type
      wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
      seedingLetters: puzzleData.seedingLetters.toUpperCase(),
      wordOfTheDayDefinition: newPuzzleForFirestore.wordOfTheDayDefinition,
    };
    return { success: true, puzzle: createdPuzzle };

  } catch (error: any) {
    console.error("Error in adminCreateDailyPuzzleAction:", error);
    return { success: false, error: error.message || "Failed to create puzzle." };
  }
}


interface AdminUpdatePuzzlePayload {
  puzzleId: string;
  puzzleData: AdminPuzzleFormState;
  actingAdminId: string;
}
export async function adminUpdateDailyPuzzleAction(payload: AdminUpdatePuzzlePayload): Promise<{ success: boolean; puzzle?: DailyPuzzle; error?: string }> {
  const { puzzleId, puzzleData, actingAdminId } = payload;
  try {
    if (!puzzleData.puzzleDateGMT) { // This date is from the form, used for returning the updated puzzle
      return { success: false, error: "Puzzle date is required for update." };
    }
    // WotD uniqueness check should be handled client-side or added here if crucial for update.

    const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, puzzleId);
    // Note: We are not updating puzzleDateGMT in Firestore here. If we were, it would need conversion.
    const dataToUpdateForFirestore: Partial<Omit<DailyPuzzle, 'puzzleDateGMT' | 'id'>> & { wordOfTheDayDefinition?: string } = {
      wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
      wordOfTheDayPoints: puzzleData.wordOfTheDayPoints,
      seedingLetters: puzzleData.seedingLetters.toUpperCase(),
      status: puzzleData.status,
      wordOfTheDayDefinition: puzzleData.wordOfTheDayDefinition || "No definition provided by admin.",
    };
    await updateDoc(puzzleDocRef, dataToUpdateForFirestore);

    await logAdminAction({
      actingAdminId,
      actionType: 'PUZZLE_UPDATE',
      targetEntityType: 'Puzzle',
      targetEntityId: puzzleId,
      targetEntityDisplay: `Puzzle for ${puzzleId}`,
      details: `Updated puzzle. WotD: ${puzzleData.wordOfTheDayText}, Status: ${puzzleData.status}.`,
    });
    
    const updatedPuzzle: DailyPuzzle = {
      id: puzzleId,
      ...puzzleData, // puzzleDateGMT here is still a Date object from AdminPuzzleFormState
      puzzleDateGMT: puzzleData.puzzleDateGMT, // Ensure this remains a Date for the return type
      wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
      seedingLetters: puzzleData.seedingLetters.toUpperCase(),
      wordOfTheDayDefinition: dataToUpdateForFirestore.wordOfTheDayDefinition,
    };
    return { success: true, puzzle: updatedPuzzle };

  } catch (error: any) {
    console.error("Error in adminUpdateDailyPuzzleAction:", error);
    return { success: false, error: error.message || "Failed to update puzzle." };
  }
}

interface AdminDeletePuzzlePayload {
  puzzleId: string;
  puzzleDateGMTString: string; // For logging
  actingAdminId: string;
}
export async function adminDeleteDailyPuzzleAction(payload: AdminDeletePuzzlePayload): Promise<{ success: boolean; error?: string }> {
  const { puzzleId, puzzleDateGMTString, actingAdminId } = payload;
  try {
    const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, puzzleId);
    await deleteDoc(puzzleDocRef);

    await logAdminAction({
      actingAdminId,
      actionType: 'PUZZLE_DELETE',
      targetEntityType: 'Puzzle',
      targetEntityId: puzzleId,
      targetEntityDisplay: `Puzzle for ${puzzleDateGMTString}`,
      details: `Deleted puzzle for ${puzzleDateGMTString}.`,
    });
    return { success: true };

  } catch (error: any) {
    console.error("Error in adminDeleteDailyPuzzleAction:", error);
    return { success: false, error: error.message || "Failed to delete puzzle." };
  }
}


interface AdminSaveGeneratedPuzzlesPayload {
    puzzlesToSave: ClientPuzzleSuggestion[];
    actingAdminId: string;
}
export async function adminSaveGeneratedPuzzlesAction(payload: AdminSaveGeneratedPuzzlesPayload): Promise<{ success: boolean; savedCount: number; error?: string }> {
    const { puzzlesToSave, actingAdminId } = payload;
    if (puzzlesToSave.length === 0) {
        return { success: false, savedCount: 0, error: "No puzzles selected to save." };
    }

    const existingPuzzleDates = new Set<string>();
    try {
        const puzzlesCollectionRef = collection(firestore, DAILY_PUZZLES_COLLECTION);
        const querySnapshot = await getDocs(puzzlesCollectionRef);
        querySnapshot.forEach((docSnap) => existingPuzzleDates.add(docSnap.id));
    } catch (error) {
        console.error("Error fetching existing puzzle dates:", error);
        return { success: false, savedCount: 0, error: "Could not verify existing puzzle dates. Aborting save." };
    }

    let currentDate = new Date();
    currentDate.setUTCHours(0, 0, 0, 0);
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);

    let savedCount = 0;
    const batch = writeBatch(firestore);
    const savedPuzzleDetails: string[] = [];

    for (const suggestion of puzzlesToSave) {
        let assignedDate = false;
        let attempts = 0;
        let tempCurrentDate = new Date(currentDate.getTime()); // Use a temporary date for iteration

        while (!assignedDate && attempts < 365 * 2) {
            const dateStr = format(tempCurrentDate, 'yyyy-MM-dd');
            if (!existingPuzzleDates.has(dateStr)) {
                const docId = dateStr;
                const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, docId);
                const firestorePuzzleData = {
                    id: docId,
                    puzzleDateGMT: Timestamp.fromDate(tempCurrentDate), 
                    wordOfTheDayText: suggestion.wordOfTheDayText.toUpperCase(),
                    wordOfTheDayPoints: suggestion.wordOfTheDayText.length * 10,
                    seedingLetters: suggestion.seedingLetters.toUpperCase(),
                    status: 'Upcoming' as const,
                    wordOfTheDayDefinition: suggestion.wordOfTheDayDefinition || "Definition from AI suggestion.",
                };
                batch.set(puzzleDocRef, firestorePuzzleData);
                existingPuzzleDates.add(dateStr); 
                savedCount++;
                assignedDate = true;
                currentDate = addDays(tempCurrentDate, 1); 
                savedPuzzleDetails.push(`${dateStr} (WotD: ${suggestion.wordOfTheDayText})`);
            } else {
                tempCurrentDate = addDays(tempCurrentDate, 1); 
            }
            attempts++;
        }
        if (!assignedDate) {
             console.warn(`Could not find an available date for ${suggestion.wordOfTheDayText} within the next 2 years.`);
        }
    }

    if (savedCount > 0) {
        try {
            await batch.commit();
            await logAdminAction({
                actingAdminId,
                actionType: 'PUZZLE_AI_SUGGESTIONS_SAVED',
                details: `Saved ${savedCount} puzzles from AI suggestions. Details: ${savedPuzzleDetails.join(', ')}`,
            });
            return { success: true, savedCount };
        } catch (error: any) {
            console.error("Error committing batch save for generated puzzles:", error);
            return { success: false, savedCount: 0, error: `Batch commit failed: ${error.message}` };
        }
    } else {
        return { success: false, savedCount: 0, error: "No puzzles were saved (possibly due to date conflicts or no available slots)." };
    }
}


interface AdminFillPuzzleGapsPayload {
    actingAdminId: string;
}
export async function adminFillPuzzleGapsAction(payload: AdminFillPuzzleGapsPayload): Promise<{ success: boolean; movedCount: number; error?: string }> {
    const { actingAdminId } = payload;
    try {
        const puzzlesCollectionRef = collection(firestore, DAILY_PUZZLES_COLLECTION);
        const allPuzzlesQuery = query(puzzlesCollectionRef, orderBy("id"));
        const allPuzzlesSnapshot = await getDocs(allPuzzlesQuery);
        
        const allPuzzlesFromFirestore: DailyPuzzle[] = [];
        allPuzzlesSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allPuzzlesFromFirestore.push({
                id: docSnap.id,
                puzzleDateGMT: (data.puzzleDateGMT as Timestamp).toDate(), // Convert to Date for DailyPuzzle type
                wordOfTheDayText: data.wordOfTheDayText,
                wordOfTheDayPoints: data.wordOfTheDayPoints,
                seedingLetters: data.seedingLetters,
                status: data.status,
                wordOfTheDayDefinition: data.wordOfTheDayDefinition || '',
            });
        });

        const fixedPuzzles = allPuzzlesFromFirestore.filter(p => p.status === 'Active' || p.status === 'Expired');
        const upcomingPuzzlesToReDate = allPuzzlesFromFirestore
            .filter(p => p.status === 'Upcoming')
            .sort((a, b) => a.puzzleDateGMT.getTime() - b.puzzleDateGMT.getTime());

        if (upcomingPuzzlesToReDate.length === 0) {
            return { success: false, movedCount: 0, error: "No 'Upcoming' puzzles to re-date." };
        }

        let earliestPossibleStartDate = startOfTomorrow();
        earliestPossibleStartDate.setUTCHours(0, 0, 0, 0);

        if (fixedPuzzles.length > 0) {
            const latestFixedPuzzleDateTime = Math.max(...fixedPuzzles.map(p => p.puzzleDateGMT.getTime()));
            const latestFixedPuzzleDate = new Date(latestFixedPuzzleDateTime);
            latestFixedPuzzleDate.setUTCHours(0, 0, 0, 0);
            const dayAfterLatestFixed = addDays(latestFixedPuzzleDate, 1);
            if (dayAfterLatestFixed.getTime() > earliestPossibleStartDate.getTime()) {
                earliestPossibleStartDate = dayAfterLatestFixed;
            }
        }

        let currentDateToFill = new Date(earliestPossibleStartDate.getTime());
        const batchCommit = writeBatch(firestore);
        let movedCount = 0;
        const currentPuzzlesById = new Map(allPuzzlesFromFirestore.map(p => [p.id, p]));
        const movedPuzzleDetails: string[] = [];

        for (const puzzleToMove of upcomingPuzzlesToReDate) {
            const originalPuzzleDateStr = puzzleToMove.id;
            let targetDateForThisPuzzle = new Date(currentDateToFill.getTime()); // This is a JS Date
            let targetDateStr = format(targetDateForThisPuzzle, 'yyyy-MM-dd');

            // Ensure targetDateStr is not an existing 'Active' or 'Expired' puzzle or an already assigned new slot
            while (currentPuzzlesById.has(targetDateStr) && currentPuzzlesById.get(targetDateStr)!.status !== 'Upcoming') {
                targetDateForThisPuzzle = addDays(targetDateForThisPuzzle, 1);
                targetDateStr = format(targetDateForThisPuzzle, 'yyyy-MM-dd');
            }
            
            if (targetDateStr !== originalPuzzleDateStr) {
                const oldDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, originalPuzzleDateStr);
                const newDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, targetDateStr);

                const newPuzzleDataForFirestore = { // Object for Firestore
                    id: targetDateStr,
                    wordOfTheDayText: puzzleToMove.wordOfTheDayText.toUpperCase(),
                    wordOfTheDayPoints: puzzleToMove.wordOfTheDayPoints,
                    seedingLetters: puzzleToMove.seedingLetters.toUpperCase(),
                    status: 'Upcoming' as const,
                    puzzleDateGMT: Timestamp.fromDate(targetDateForThisPuzzle), // Convert JS Date to Timestamp for Firestore
                    wordOfTheDayDefinition: puzzleToMove.wordOfTheDayDefinition || "No definition provided.",
                };

                batchCommit.delete(oldDocRef);
                batchCommit.set(newDocRef, newPuzzleDataForFirestore);
                movedCount++;
                movedPuzzleDetails.push(`Moved ${originalPuzzleDateStr} to ${targetDateStr}`);

                // Update local map for next iteration (ensure puzzleDateGMT is Date for DailyPuzzle type)
                currentPuzzlesById.delete(originalPuzzleDateStr);
                currentPuzzlesById.set(targetDateStr, { ...puzzleToMove, id: targetDateStr, puzzleDateGMT: targetDateForThisPuzzle, status: 'Upcoming' });
            }
            currentDateToFill = addDays(targetDateForThisPuzzle, 1);
        }

        if (movedCount > 0) {
            await batchCommit.commit();
            await logAdminAction({
                actingAdminId,
                actionType: 'PUZZLE_FILL_GAPS',
                details: `Re-dated ${movedCount} upcoming puzzles to fill gaps. Changes: ${movedPuzzleDetails.join('; ')}`,
            });
            return { success: true, movedCount };
        } else {
            return { success: false, movedCount: 0, error: "No gaps found or no puzzles needed re-dating." };
        }
    } catch (error: any) {
        console.error("Error filling puzzle gaps:", error);
        return { success: false, movedCount: 0, error: error.message || "Could not re-date puzzles." };
    }
}


interface AdminReseedPuzzlesPayload {
    actingAdminId: string;
}
const generateNewSeedingLettersInternal = (wotd: string): string => {
    const wotdChars = wotd.toUpperCase().split('');
    let currentLetters = [...wotdChars];
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    while (currentLetters.length < 9) {
        const randomChar = alphabet[Math.floor(Math.random() * alphabet.length)];
        currentLetters.push(randomChar);
    }
    for (let i = currentLetters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentLetters[i], currentLetters[j]] = [currentLetters[j], currentLetters[i]];
    }
    return currentLetters.join('');
};
export async function adminReseedUpcomingPuzzlesAction(payload: AdminReseedPuzzlesPayload): Promise<{ success: boolean; reseededCount: number; error?: string }> {
    const { actingAdminId } = payload;
    try {
        const puzzlesCollectionRef = collection(firestore, DAILY_PUZZLES_COLLECTION);
        const upcomingPuzzlesQuery = query(puzzlesCollectionRef, where("status", "==", "Upcoming"));
        const upcomingPuzzlesSnap = await getDocs(upcomingPuzzlesQuery);

        if (upcomingPuzzlesSnap.empty) {
            return { success: false, reseededCount: 0, error: "No 'Upcoming' puzzles to reseed." };
        }

        const batch = writeBatch(firestore);
        let reseededCount = 0;
        const reseededPuzzleIds: string[] = [];

        upcomingPuzzlesSnap.forEach(docSnap => {
            // We don't strictly need to cast to DailyPuzzle here if we only access common fields
            // but if we do, ensure puzzleDateGMT conversion is handled if used.
            const puzzleData = docSnap.data(); 
            const newSeedingLetters = generateNewSeedingLettersInternal(puzzleData.wordOfTheDayText);
            batch.update(docSnap.ref, { seedingLetters: newSeedingLetters });
            reseededCount++;
            reseededPuzzleIds.push(docSnap.id);
        });

        await batch.commit();
        await logAdminAction({
            actingAdminId,
            actionType: 'PUZZLE_RESEED_UPCOMING',
            details: `Reseeded ${reseededCount} upcoming puzzles: ${reseededPuzzleIds.join(', ')}.`,
        });
        return { success: true, reseededCount };

    } catch (error: any) {
        console.error("Error reseeding puzzles:", error);
        return { success: false, reseededCount: 0, error: error.message || "Could not reseed puzzles." };
    }
}

