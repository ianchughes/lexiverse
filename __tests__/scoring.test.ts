import { calculateWordScore } from '@/lib/scoring';

describe('calculateWordScore', () => {
  it('should return 0 for words shorter than 4 letters', () => {
    expect(calculateWordScore('THE', 4)).toBe(0);
    expect(calculateWordScore('I', 7)).toBe(0);
  });

  it('should calculate scores for high frequency, short words (Tier 4)', () => {
    // 10 + (6 - length) * 2
    expect(calculateWordScore('TEST', 4)).toBe(14); // 10 + (2*2) = 14
    expect(calculateWordScore('HELLO', 5)).toBe(12); // 10 + (1*2) = 12
  });

  it('should calculate scores for high frequency, long words (Tier 3)', () => {
    // 20 + (10 - length) * 3
    expect(calculateWordScore('COMMON', 4)).toBe(32); // 20 + (4*3) = 32
    expect(calculateWordScore('LANGUAGE', 4)).toBe(26); // 20 + (2*3) = 26
    expect(calculateWordScore('NINETEEN', 4)).toBe(26); // 20 + (2*3) = 26
  });

  it('should calculate scores for low frequency, short words (Tier 1)', () => {
    // 80 + (6 - length) * 10
    expect(calculateWordScore('JINX', 3)).toBe(100); // 80 + (2*10) = 100
    expect(calculateWordScore('QUIZ', 2)).toBe(100); // 80 + (2*10) = 100
  });

  it('should calculate scores for low frequency, long words (Tier 2)', () => {
    // 50 + (10 - length) * 5
    expect(calculateWordScore('ZYXOMMA', 1)).toBe(65); // 50 + (3*5) = 65
    expect(calculateWordScore('SYZYGY', 1)).toBe(70); // 50 + (4*5) = 70
  });

  it('should always return a minimum score of 5 for valid length words', () => {
    // A very common, very long word might calculate to less than 5
    expect(calculateWordScore('INTERNATIONAL', 7)).toBe(5); // Calculated: 20 + (-1*3) = 17 (but should be at least 5)
    // A high-freq, 5-letter word
    expect(calculateWordScore('THERE', 7)).toBe(12);
  });
});
