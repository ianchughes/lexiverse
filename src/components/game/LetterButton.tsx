'use client';

import type { SeedingLetter } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LetterButtonProps {
  letter: SeedingLetter;
  onClick: (letter: SeedingLetter) => void;
  disabled: boolean;
  isSelected: boolean;
}

export function LetterButton({ letter, onClick, disabled, isSelected }: LetterButtonProps) {
  return (
    <Button
      variant="outline"
      size="lg"
      className={cn(
        'font-headline text-2xl md:text-3xl w-16 h-16 md:w-20 md:h-20 transition-all duration-150 ease-in-out',
        isSelected ? 'bg-primary text-primary-foreground scale-90' : 'bg-card hover:bg-accent hover:text-accent-foreground',
        disabled && !isSelected ? 'opacity-50 cursor-not-allowed' : ''
      )}
      onClick={() => onClick(letter)}
      disabled={disabled && !isSelected}
      aria-label={`Letter ${letter.char}`}
    >
      {letter.char.toUpperCase()}
    </Button>
  );
}
