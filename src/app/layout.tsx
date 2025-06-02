
import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/contexts/AuthContext'; // Import AuthProvider
import { SuggestionsBot } from '@/components/suggestions-bot/SuggestionsBot'; // Import SuggestionsBot

export const metadata: Metadata = {
  title: 'Lexiverse - Daily Word Puzzle',
  description: 'Find words, own discoveries, and compete in Lexi Circles!',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        <AuthProvider> {/* Wrap with AuthProvider */}
          <SiteHeader />
          <main className="flex-grow container mx-auto px-4 py-8">
            {children}
          </main>
          <SiteFooter />
          <Toaster />
          <SuggestionsBot /> {/* Add SuggestionsBot here */}
        </AuthProvider>
      </body>
    </html>
  );
}
