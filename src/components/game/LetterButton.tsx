
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
      size="lg" // Base size prop, actual dimensions controlled by className
      className={cn(
        'font-headline transition-all duration-150 ease-in-out',
        'w-14 h-14 text-xl', // Base size for extra small screens
        'sm:w-16 sm:h-16 sm:text-2xl', // Small screens and up
        'md:w-20 md:h-20 md:text-3xl', // Medium screens and up
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
