
export function SiteFooter() {
  return (
    <footer className="py-6 md:px-8 md:py-0 border-t border-border/40">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-20 md:flex-row">
        <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
          © {new Date().getFullYear()} LexiVerse. All rights reserved.
        </p>
        {/* TODO: Add social links or other footer content if needed */}
      </div>
    </footer>
  );
}

