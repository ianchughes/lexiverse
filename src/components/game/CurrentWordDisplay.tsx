'use client';

interface CurrentWordDisplayProps {
  word: string;
  isInvalid?: boolean;
}

export function CurrentWordDisplay({ word, isInvalid = false }: CurrentWordDisplayProps) {
  const displayWord = word || "Type a word...";
  return (
    <div className="my-6 h-16 flex items-center justify-center bg-card p-3 rounded-md shadow-inner text-center">
      <p 
        className={`font-headline text-3xl tracking-wider ${
          isInvalid ? 'text-destructive animate-pulse-once' : 'text-foreground'
        } ${!word ? 'text-muted-foreground' : ''}`}
      >
        {displayWord.toUpperCase()}
      </p>
    </div>
  );
}
