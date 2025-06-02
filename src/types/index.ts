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
