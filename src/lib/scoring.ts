
// src/lib/scoring.ts
export function calculateWordScore(wordText: string, frequency: number): number {
  const length = wordText.length;
  let points = 0;

  // Define thresholds
  const LOW_FREQ_THRESHOLD = 3.5; // WordsAPI Zipf scale, lower is rarer (typically 1-7)
  const SHORT_WORD_MAX_LENGTH = 5; // Words of this length or less are "short"
  const MIN_WORD_LENGTH_FOR_SCORING = 4; // Min length of words considered for scoring

  if (length < MIN_WORD_LENGTH_FOR_SCORING) {
    return 0; // Words shorter than this don't score
  }

  const isLowFreq = frequency < LOW_FREQ_THRESHOLD;
  const isShort = length <= SHORT_WORD_MAX_LENGTH;

  if (isLowFreq) {
    if (isShort) {
      // Tier 1: Low Frequency, Short Word (e.g., 4-5 letters)
      points = 80 + (6 - length) * 10; // Max for 4-letter: 80 + 20 = 100. For 5-letter: 80 + 10 = 90
    } else {
      // Tier 2: Low Frequency, Long Word (e.g., 6-9 letters)
      points = 50 + (10 - length) * 5; // Max for 6-letter: 50 + 20 = 70. For 9-letter: 50 + 5 = 55
    }
  } else { // High Frequency
    if (!isShort) {
      // Tier 3: High Frequency, Long Word (e.g., 6-9 letters)
      points = 20 + (10 - length) * 3; // Max for 6-letter: 20 + 12 = 32. For 9-letter: 20 + 3 = 23
    } else {
      // Tier 4: High Frequency, Short Word (e.g., 4-5 letters)
      points = 10 + (6 - length) * 2;  // Max for 4-letter: 10 + 4 = 14. For 5-letter: 10 + 2 = 12
    }
  }

  // Ensure a minimum score for any valid word that meets length criteria
  return Math.max(5, Math.round(points));
}
