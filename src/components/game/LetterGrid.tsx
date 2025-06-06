
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
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3 p-2 sm:p-3 md:p-4 bg-secondary/30 rounded-lg shadow-md max-w-[240px] xs:max-w-[280px] sm:max-w-xs md:max-w-sm mx-auto">
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
