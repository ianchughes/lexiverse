'use client';

import type { SeedingLetter } from '@/types';
import { useDevice } from '@/contexts/DeviceContext';
import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';


interface LetterGridProps {
  letters: SeedingLetter[];
  onLetterClick: (letter: SeedingLetter) => void;
  selectedIndices: number[]; // Indices of letters used in the current word
  disabled: boolean;
}

export function LetterGrid({ letters, onLetterClick, selectedIndices, disabled }: LetterGridProps) {
  const { isTouchDevice } = useDevice();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent, letter: SeedingLetter) => {
    // Prevent default touch behaviors like scrolling or zooming on the grid
    e.preventDefault();
    if (disabled || selectedIndices.includes(letter.index)) return;

    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    
    // Haptic feedback for a more native feel
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, [disabled, selectedIndices]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent, letter: SeedingLetter) => {
    e.preventDefault();
    if (disabled || selectedIndices.includes(letter.index)) return;

    if (touchStartRef.current) {
      const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      const distance = Math.sqrt(
        Math.pow(touchEnd.x - touchStartRef.current.x, 2) + 
        Math.pow(touchEnd.y - touchStartRef.current.y, 2)
      );
      
      // Only register as a tap if the finger didn't move significantly
      if (distance < 15) { // Increased threshold slightly for less sensitive taps
        onLetterClick(letter);
      }
    }
    touchStartRef.current = null;
  }, [onLetterClick, disabled, selectedIndices]);


  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 p-2 bg-secondary/30 rounded-lg shadow-md mx-auto">
      {letters.map((letter) => {
         const isSelected = selectedIndices.includes(letter.index);
         const isDisabled = disabled || isSelected;

         const touchProps = isTouchDevice ? {
            onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => handleTouchStart(e, letter),
            onTouchEnd: (e: React.TouchEvent<HTMLButtonElement>) => handleTouchEnd(e, letter),
          } : {};

        return (
            <Button
              key={letter.id}
              variant="outline"
              size="lg"
              className={cn(
                'font-headline transition-all duration-150 ease-in-out select-none',
                'w-14 h-14 text-xl', 
                'sm:w-16 sm:h-16 sm:text-2xl', 
                'md:w-20 md:h-20 md:text-3xl',
                isSelected ? 'bg-primary text-primary-foreground scale-90' : 'bg-card',
                 !isSelected && !disabled ? (isTouchDevice ? 'active:bg-accent active:text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground') : '',
                isDisabled && !isSelected ? 'opacity-50 cursor-not-allowed' : ''
              )}
              onClick={() => !isTouchDevice && onLetterClick(letter)}
              disabled={isDisabled}
              aria-label={`Letter ${letter.char}`}
              {...touchProps}
            >
              {letter.char.toUpperCase()}
            </Button>
        )
      })}
    </div>
  );
}
