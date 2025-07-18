
'use client'; // Required for useEffect

import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/contexts/AuthContext'; 
import { SuggestionsBot } from '@/components/suggestions-bot/SuggestionsBot';
import React, { useEffect } from 'react'; // Import useEffect
import { DeviceProvider } from '@/contexts/DeviceContext';

// export const metadata: Metadata = { // Metadata object should be defined in server components
//   title: 'LexiVerse - Daily Word Puzzle',
//   description: 'Find words, own discoveries, and compete in Lexi Circles!',
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => console.log('Service Worker registered with scope:', registration.scope))
        .catch((error) => console.error('Service Worker registration failed:', error));
    }
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA Manifest and Theme Color */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4285F4" /> 
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        {/* It's generally better to define title and description via Next.js metadata API in page.tsx or server layout components */}
        {/* For a client root layout, you might set document.title directly in a useEffect if needed, or handle metadata at page level */}
        <title>LexiVerse - Daily Word Puzzle</title>
        <meta name="description" content="Find words, own discoveries, and compete in Lexi Circles!" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased min-h-svh flex flex-col" suppressHydrationWarning>
        <AuthProvider> 
          <DeviceProvider>
            <SiteHeader />
            <main className="flex-grow container mx-auto px-4 py-8 md:px-6">
              {children}
            </main>
            <SiteFooter />
            <Toaster />
            <SuggestionsBot /> 
          </DeviceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
