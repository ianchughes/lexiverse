
import type { Timestamp } from 'firebase/firestore';

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
  newlyOwned?: boolean; // Flag if ownership was gained this session
}

export type GameState = 'idle' | 'playing' | 'cooldown' | 'debrief';

export interface DailyPuzzle {
  id: string; // Typically PuzzleDate_GMT e.g., "2025-06-01"
  puzzleDateGMT: Date; // Store as Date object client-side, convert to Timestamp for Firestore
  wordOfTheDayText: string;
  wordOfTheDayPoints: number;
  seedingLetters: string; // Stored as a 9-char string
  status: 'Upcoming' | 'Active' | 'Expired';
  wordOfTheDayDefinition?: string; // Definition for the Word of the Day
}

export type AdminPuzzleFormState = Omit<DailyPuzzle, 'id' | 'status' | 'puzzleDateGMT'> & {
  puzzleDateGMT: Date | undefined;
  status: 'Upcoming' | 'Active';
  wordOfTheDayText: string;
  wordOfTheDayPoints: number;
  seedingLetters: string;
  wordOfTheDayDefinition?: string;
};

// User Profile and Roles
export type AccountStatus = 'Active' | 'Blocked' | 'PendingVerification';
export type UserRole = 'admin' | 'moderator' | 'user';

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  photoURL?: string; // Added for profile picture
  registrationCountry: string;
  overallPersistentScore: number;
  dateCreated: Timestamp;
  accountStatus: AccountStatus;
  lastPlayedDate_GMT: string | null; // Stored as 'YYYY-MM-DD' string
  wotdStreakCount: number;
  activeCircleId?: string; // ID of the primary circle the user is contributing to (optional)
  hasSeenWelcomeInstructions?: boolean; // New field
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
  submittedTimestamp: Timestamp;
  puzzleDateGMT: string;
  moderatorNotes?: string;
  reviewedByUID?: string;
  reviewedTimestamp?: Timestamp;
  isWotDClaim?: boolean; // Flag if this submission is for a WotD not in the dictionary
}

export interface MasterWordType {
  wordText: string; // UPPERCASE (Document ID)
  definition: string;
  frequency: number;
  status: 'Approved' | 'SystemInitial';
  addedByUID: string;
  dateAdded: Timestamp;
  originalSubmitterUID?: string | null; // Can be null if disassociated
  puzzleDateGMTOfSubmission?: string | null; // Can be null if disassociated
  pendingTransferId?: string | null; // ID of an active WordTransfer document
}

export type RejectionType = 'Gibberish' | 'AdminDecision';

export interface RejectedWordType {
  wordText: string; // UPPERCASE (Document ID)
  rejectionType: RejectionType;
  rejectedByUID: string;
  dateRejected: Timestamp;
  originalSubmitterUID?: string;
}


export interface SystemSettings {
  lastForcedResetTimestamp?: Timestamp;
  // uiTone?: number; // Removed uiTone
  // Add other global settings here
}

// For AI-generated puzzle suggestions (client-side & flow output)
export interface PuzzleSuggestion { // Client-side type with ID
  wordOfTheDayText: string;
  seedingLetters: string;
  wordOfTheDayDefinition: string;
  id: string;
}

type AIPuzzleSuggestionFromFlow = {
  wordOfTheDayText: string;
  seedingLetters: string;
  wordOfTheDayDefinition: string;
};
export type GeneratePuzzleSuggestionsOutput = {
  suggestions: AIPuzzleSuggestionFromFlow[];
};
export type { GeneratePuzzleSuggestionsInput } from '@/ai/flows/generate-puzzle-suggestions';
export type { AIPuzzleSuggestionFromFlow as AIPuzzleSuggestionType };


// --- Circles Feature Types ---
export type CircleStatus = 'Active' | 'Barred_NameIssue' | 'Deleted_ByUser' | 'Deleted_ByAdmin';
export type CircleMemberRole = 'Admin' | 'Member' | 'Influencer'; // Added 'Influencer'

export interface Circle {
  id: string; // Firestore Document ID
  circleName: string;
  circleNameLower: string; // For case-insensitive unique checks
  creatorUserID: string;
  dateCreated: Timestamp;
  status: CircleStatus;
  isPublic: boolean;
  publicDescription?: string;
  publicTags?: string[];
  inviteLinkCode: string; // Unique code for joining via link
  memberCount: number; // Denormalized for quick display
}

export interface CircleMember {
  id?: string; // Firestore Document ID (e.g., CircleID_UserID for root collection, or use auto-ID if preferred and query)
  circleId: string;
  userId: string;
  username: string; // Denormalized for display
  role: CircleMemberRole;
  dateJoined: Timestamp;
  photoURL?: string; // Denormalized for display
}

export type CircleInviteStatus = 'Sent' | 'SentToEmail' | 'Accepted' | 'Declined' | 'Expired';

export interface CircleInvite {
  id?: string; // Firestore Document ID
  circleId: string;
  circleName: string; // Denormalized
  inviterUserId: string;
  inviterUsername: string; // Denormalized
  inviteeUserId?: string;
  inviteeEmail?: string;
  status: CircleInviteStatus;
  dateSent: Timestamp;
  dateResponded?: Timestamp;
  lastReminderSentTimestamp?: Timestamp; // New field
  adminNotes?: string; // New field for admin actions
}

export interface CircleDailyScore {
  id?: string; // Firestore Document ID (e.g., PuzzleDateGMT_CircleID)
  puzzleDateGMT: string; // YYYY-MM-DD
  circleId: string;
  dailyTotalScore: number;
}

export interface CircleWeeklyScore {
  id?: string; // Firestore Document ID (e.g., WeekStartDateGMT_CircleID)
  weekStartDateGMT: string; // YYYY-MM-DD (e.g., Monday's date)
  circleId: string;
  totalScore: number;
  globalRank?: number;
}

export interface CircleMonthlyScore {
  id?: string; // Firestore Document ID (e.g., MonthYear_CircleID, "2025-07_circleId")
  monthYear: string; // YYYY-MM
  circleId: string;
  monthlyTotalScore: number;
}

export interface UserDailyPlaySession { // Assumed, for score contribution logic
  userId: string;
  puzzleDateGMT: string;
  finalDailyScore: number;
  // ... other session details
}

// For client-side display, often combining Circle with member/score info
export interface CircleWithDetails extends Circle {
  members: CircleMember[];
  scores?: {
    daily?: CircleDailyScore;
    weekly?: CircleWeeklyScore;
    monthly?: CircleMonthlyScore;
    overallCalculated?: number;
  };
  currentUserRole?: CircleMemberRole; // Role of the viewing user in this circle
}

export type NotificationType =
  | 'CircleInvite'
  | 'CircleJoinConfirmation'
  | 'CircleAdminAction'
  | 'Achievement'
  | 'Generic'
  | 'WordTransferRequest' // New notification type
  | 'WordTransferResult'; // New notification type

export interface AppNotification {
  id?: string;
  userId: string; // User to notify
  message: string;
  type: NotificationType;
  relatedEntityId?: string; // e.g., CircleID, UserID, WordTransferID
  isRead: boolean;
  dateCreated: Timestamp;
  link?: string; // Optional link for the notification
}

// User Suggestions Log
export interface UserSuggestionLog {
  id?: string;
  userId?: string; // Optional, if user is logged in
  suggestionText: string;
  botResponse: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
  timestamp: Timestamp;
}

// Word Transfer Types
export type WordTransferStatus = 'PendingRecipient' | 'Accepted' | 'Declined' | 'Expired' | 'CancelledBySender';

export interface WordTransfer {
  id?: string; // Firestore Document ID
  wordText: string;
  senderUserId: string;
  senderUsername: string;
  recipientUserId: string;
  recipientUsername: string;
  status: WordTransferStatus;
  initiatedAt: Timestamp;
  expiresAt: Timestamp;
  respondedAt?: Timestamp;
}
