
export interface SeedingLetter {
  id: string; // Unique ID for each letter instance, e.g., `letter-${index}`
  char: string;
  index: number; // Original index in the seeding array
}

export interface SubmittedWord {
  id: string;
  text: string;
  points: number;
  isWotD: boolean;
}

export type GameState = 'idle' | 'playing' | 'cooldown' | 'debrief';

export interface DailyPuzzle {
  id: string; // Typically PuzzleDate_GMT e.g., "2025-06-01"
  puzzleDateGMT: Date;
  wordOfTheDayText: string;
  wordOfTheDayPoints: number;
  seedingLetters: string; // Stored as a 9-char string for simplicity in this form
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
