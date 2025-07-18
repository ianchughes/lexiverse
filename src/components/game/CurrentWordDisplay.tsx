
'use client';

interface CurrentWordDisplayProps {
  word: string;
  isInvalid?: boolean;
}

export function CurrentWordDisplay({ word, isInvalid = false }: CurrentWordDisplayProps) {
  const displayWord = word || "Type a word...";
  return (
    <div className="my-4 sm:my-5 md:my-6 h-12 sm:h-14 md:h-16 flex items-center justify-center bg-card p-2 sm:p-3 rounded-md shadow-inner text-center">
      <p 
        className={`font-headline tracking-wider text-xl sm:text-2xl md:text-3xl transition-colors ${
          isInvalid ? 'text-destructive animate-pulse-once' : 'text-foreground'
        } ${!word ? 'text-muted-foreground' : ''}`}
      >
        {displayWord.toUpperCase()}
      </p>
    </div>
  );
}
