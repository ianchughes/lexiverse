
export interface SeedingLetter {
  id: string; // Unique ID for each letter instance, e.g., `letter-${index}`
  char: string;
  index: number; // Original index in the seeding array
}

export interface SubmittedWord {
  id: string;
  text: string;
  points: number; // Points awarded in the current session for this word
  isWotD: boolean;
}

export type GameState = 'idle' | 'playing' | 'cooldown' | 'debrief';

export interface DailyPuzzle {
  id: string; // Typically PuzzleDate_GMT e.g., "2025-06-01"
  puzzleDateGMT: Date; // Store as Date object client-side, convert to Timestamp for Firestore
  wordOfTheDayText: string;
  wordOfTheDayPoints: number; // This might become obsolete if points are always dynamic
  seedingLetters: string; // Stored as a 9-char string
  status: 'Upcoming' | 'Active' | 'Expired';
}

export type AdminPuzzleFormState = Omit<DailyPuzzle, 'id' | 'status' | 'puzzleDateGMT'> & {
  puzzleDateGMT: Date | undefined;
  status: 'Upcoming' | 'Active';
};

// User Profile and Roles
export type AccountStatus = 'Active' | 'Blocked' | 'PendingVerification';
export type UserRole = 'admin' | 'moderator' | 'user';

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  registrationCountry: string;
  overallPersistentScore: number;
  dateCreated: any; // Firestore Timestamp, consider a more specific type if using date-fns for conversion
  accountStatus: AccountStatus;
  lastPlayedDate_GMT: any | null; // Firestore Timestamp
  wotdStreakCount: number;
}

export interface AdminRoleDoc {
  role: Exclude<UserRole, 'user'>; // 'admin' or 'moderator'
}

export interface UserProfileWithRole extends UserProfile {
  role: UserRole;
}

export type WordSubmissionStatus =
  | 'PendingModeratorReview'
  | 'Approved'
  | 'Rejected_NotReal'       // For gibberish/non-words
  | 'Rejected_AdminDecision' // For other admin reasons (e.g., offensive, too obscure)
  | 'Rejected_Duplicate'     // If found to be a duplicate of an already approved word
  | 'AutoRejected_KnownBad'; // If the word was already in the RejectedWords list

export interface WordSubmission {
  id?: string; // Firestore will auto-generate this for WordSubmissionsQueue
  wordText: string; // Should be normalized (e.g., uppercase)
  definition?: string;
  frequency?: number; // e.g., Zipf score from WordsAPI
  status: WordSubmissionStatus;
  submittedByUID: string;
  submittedTimestamp: any; // Firestore serverTimestamp
  puzzleDateGMT: string; // YYYY-MM-DD format of the puzzle being played
  moderatorNotes?: string;
  reviewedByUID?: string;
  reviewedTimestamp?: any; // Firestore serverTimestamp
}

export interface MasterWord {
  // Document ID for this collection will be the wordText in UPPERCASE
  wordText: string; // UPPERCASE
  definition: string;
  frequency: number; // Store frequency, as points are calculated wordText.length * frequency
  status: 'Approved' | 'SystemInitial'; // SystemInitial for pre-loaded words
  addedByUID: string; // UID of admin/moderator who approved/added it
  dateAdded: any; // Firestore serverTimestamp
  originalSubmitterUID?: string; // UID of the player who first submitted it (if applicable)
  puzzleDateGMTOfSubmission?: string; // Date of puzzle when it was submitted (if applicable)
}

export type RejectionType = 'Gibberish' | 'AdminDecision';

export interface RejectedWord {
  // Document ID for this collection will be the wordText in UPPERCASE
  wordText: string; // UPPERCASE
  rejectionType: RejectionType;
  rejectedByUID: string;
  dateRejected: any; // Firestore serverTimestamp
  originalSubmitterUID?: string; // If this rejection originated from a player's submission
}


export interface SystemSettings {
  lastForcedResetTimestamp?: any; // Firestore Timestamp
  // Add other global settings here
}

// For AI-generated puzzle suggestions (client-side & flow output)
export interface PuzzleSuggestion {
  wordOfTheDayText: string;
  seedingLetters: string;
  wordOfTheDayDefinition: string; // Added field
  id: string; // Client-side unique ID for selection tracking, e.g., crypto.randomUUID()
}

// Corresponds to the Zod schemas in the AI flow generate-puzzle-suggestions.ts
// Exporting the flow's direct output type which now includes the definition.
type AIPuzzleSuggestionFromFlow = {
  wordOfTheDayText: string;
  seedingLetters: string;
  wordOfTheDayDefinition: string;
};
export type GeneratePuzzleSuggestionsOutput = {
  suggestions: AIPuzzleSuggestionFromFlow[];
};
export type { GeneratePuzzleSuggestionsInput } from '@/ai/flows/generate-puzzle-suggestions'; // Input type remains the same
// Re-alias for clarity if used elsewhere, though PuzzleSuggestion from above is likely more used on client.
export type { AIPuzzleSuggestionFromFlow as AIPuzzleSuggestionType };
