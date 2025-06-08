
'use client';

import { Clock } from 'lucide-react';

interface GameTimerProps {
  timeLeft: number;
}

export function GameTimer({ timeLeft }: GameTimerProps) {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="flex items-center justify-center space-x-2 p-2 sm:p-3 bg-card rounded-lg shadow-md text-base sm:text-lg md:text-xl font-medium text-primary">
      <Clock className="h-5 w-5 sm:h-6 sm:w-6" />
      <span>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
