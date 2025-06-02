import Link from 'next/link';
import { BookText } from 'lucide-react';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center">
        <Link href="/" className="flex items-center space-x-2">
          <BookText className="h-6 w-6 text-primary" />
          <span className="font-headline text-2xl font-bold text-primary">Lexiverse</span>
        </Link>
        {/* TODO: Add navigation links if needed later (e.g., Profile, Circles, Admin) */}
      </div>
    </header>
  );
}
