
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
  wordOfTheDayPoints: number; 
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
  | 'Rejected_NotReal'       
  | 'Rejected_AdminDecision' 
  | 'Rejected_Duplicate'     
  | 'AutoRejected_KnownBad'; 

export interface WordSubmission {
  id?: string; 
  wordText: string; 
  definition?: string;
  frequency?: number; 
  status: WordSubmissionStatus;
  submittedByUID: string;
  submittedTimestamp: any; 
  puzzleDateGMT: string; 
  moderatorNotes?: string;
  reviewedByUID?: string;
  reviewedTimestamp?: any; 
}

export interface MasterWordType { // Renamed from MasterWord to avoid conflict
  // Document ID for this collection will be the wordText in UPPERCASE
  wordText: string; // UPPERCASE
  definition: string;
  frequency: number; 
  status: 'Approved' | 'SystemInitial'; 
  addedByUID: string; 
  dateAdded: any; // Firestore serverTimestamp
  originalSubmitterUID?: string; 
  puzzleDateGMTOfSubmission?: string; 
}

export type RejectionType = 'Gibberish' | 'AdminDecision';

export interface RejectedWordType { // Renamed from RejectedWord to avoid conflict
  // Document ID for this collection will be the wordText in UPPERCASE
  wordText: string; // UPPERCASE
  rejectionType: RejectionType;
  rejectedByUID: string;
  dateRejected: any; // Firestore serverTimestamp
  originalSubmitterUID?: string; 
}


export interface SystemSettings {
  lastForcedResetTimestamp?: any; // Firestore Timestamp
  // Add other global settings here
}

// For AI-generated puzzle suggestions (client-side & flow output)
export interface PuzzleSuggestion {
  wordOfTheDayText: string;
  seedingLetters: string;
  wordOfTheDayDefinition: string; 
  id: string; 
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
export type { GeneratePuzzleSuggestionsInput } from '@/ai/flows/generate-puzzle-suggestions'; 
// Re-alias for clarity if used elsewhere, though PuzzleSuggestion from above is likely more used on client.
export type { AIPuzzleSuggestionFromFlow as AIPuzzleSuggestionType };

