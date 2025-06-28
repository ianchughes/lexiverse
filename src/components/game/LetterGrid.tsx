
'use client';

import type { SeedingLetter } from '@/types';
import { LetterButton } from './LetterButton';

interface LetterGridProps {
  letters: SeedingLetter[];
  onLetterClick: (letter: SeedingLetter) => void;
  selectedIndices: number[]; // Indices of letters used in the current word
  disabled: boolean;
}

export function LetterGrid({ letters, onLetterClick, selectedIndices, disabled }: LetterGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 p-2 bg-secondary/30 rounded-lg shadow-md mx-auto">
      {letters.map((letter) => (
        <LetterButton
          key={letter.id}
          letter={letter}
          onClick={onLetterClick}
          disabled={disabled || selectedIndices.includes(letter.index)}
          isSelected={selectedIndices.includes(letter.index)}
        />
      ))}
    </div>
  );
}
