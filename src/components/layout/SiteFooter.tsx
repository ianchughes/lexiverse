
import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="py-6 md:px-8 md:py-0 border-t border-border/40">
      <div className="container flex flex-col items-center justify-center gap-4 md:h-20 md:flex-row md:justify-between">
        <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
          © {new Date().getFullYear()} LexiVerse. All rights reserved.
        </p>
        <nav className="flex gap-4 items-center text-sm text-muted-foreground">
          <Link href="/changelog" className="hover:text-primary transition-colors">
            Changelog
          </Link>
          {/* Add other footer links here if needed, e.g., Privacy Policy, Terms */}
        </nav>
      </div>
    </footer>
  );
}

