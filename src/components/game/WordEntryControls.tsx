'use client';

import { Button } from '@/components/ui/button';
import { Zap, RotateCcw, Delete } from 'lucide-react';

interface WordEntryControlsProps {
  onSubmit: () => void;
  onClear: () => void;
  onBackspace: () => void;
  canSubmit: boolean;
  canClearOrBackspace: boolean;
  isSubmitting: boolean;
}

export function WordEntryControls({
  onSubmit,
  onClear,
  onBackspace,
  canSubmit,
  canClearOrBackspace,
  isSubmitting,
}: WordEntryControlsProps) {
  return (
    <div className="flex justify-center space-x-2 md:space-x-3 my-6">
      <Button
        variant="outline"
        size="lg"
        onClick={onBackspace}
        disabled={!canClearOrBackspace || isSubmitting}
        aria-label="Backspace"
        className="px-4 md:px-6"
      >
        <Delete className="h-5 w-5 md:mr-2" />
        <span className="hidden md:inline">Backspace</span>
      </Button>
      <Button
        variant="outline"
        size="lg"
        onClick={onClear}
        disabled={!canClearOrBackspace || isSubmitting}
        aria-label="Clear word"
        className="px-4 md:px-6"
      >
        <RotateCcw className="h-5 w-5 md:mr-2" />
        <span className="hidden md:inline">Clear</span>
      </Button>
      <Button
        size="lg"
        onClick={onSubmit}
        disabled={!canSubmit || isSubmitting}
        aria-label="Submit word"
        className="px-4 md:px-6 bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        <Zap className="h-5 w-5 md:mr-2" />
        <span className="hidden md:inline">Submit</span>
        <span className="md:hidden">Submit</span>
      </Button>
    </div>
  );
}
