
'use client';
import Link from 'next/link';
import { BookText, Users, LogIn, LogOut, UserCircle, ShieldCheck, Bell, FileText, Award, Sparkles, BadgeCent } from 'lucide-react'; // Added BadgeCent
import { useAuth } from '@/contexts/AuthContext';
import { auth, firestore } from '@/lib/firebase'; // Added firestore
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React, { useEffect, useState, useRef } from 'react'; // Added useEffect, useState, useRef
import { collection, query, where, getDocs } from 'firebase/firestore'; // Added Firestore imports
import { useDevice } from '@/contexts/DeviceContext';

const LOCALSTORAGE_OWNED_WORDS_COUNT_KEY = 'lexiverse_owned_words_count';

export function SiteHeader() {
  const { currentUser, userProfile, userRole, isLoadingAuth } = useAuth();
  const { isMobile, isDesktop } = useDevice();
  const router = useRouter();

  const [ownedWordsCount, setOwnedWordsCount] = useState<number | null>(null);
  const [showOwnedWordsSparkle, setShowOwnedWordsSparkle] = useState(false);
  const [initialScoreOnLoad, setInitialScoreOnLoad] = useState<number | null>(null);
  const [pointsGainedDisplay, setPointsGainedDisplay] = useState<number>(0);

  const initialScoreCaptured = useRef(false);

  useEffect(() => {
    if (currentUser && !isLoadingAuth) {
      const fetchOwnedWords = async () => {
        try {
          const q = query(collection(firestore, "Words"), where("originalSubmitterUID", "==", currentUser.uid));
          const querySnapshot = await getDocs(q);
          const currentCount = querySnapshot.size;
          setOwnedWordsCount(currentCount);

          if (typeof window !== 'undefined') {
            const storedCountStr = localStorage.getItem(LOCALSTORAGE_OWNED_WORDS_COUNT_KEY);
            if (storedCountStr !== null) {
              const storedCount = parseInt(storedCountStr, 10);
              if (currentCount > storedCount) {
                setShowOwnedWordsSparkle(true);
                setTimeout(() => setShowOwnedWordsSparkle(false), 3000); // Sparkle for 3 seconds
              }
            }
            localStorage.setItem(LOCALSTORAGE_OWNED_WORDS_COUNT_KEY, currentCount.toString());
          }
        } catch (error) {
          console.error("Error fetching owned words count:", error);
        }
      };
      fetchOwnedWords();
    } else if (!currentUser && !isLoadingAuth) {
      setOwnedWordsCount(null);
      setShowOwnedWordsSparkle(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCALSTORAGE_OWNED_WORDS_COUNT_KEY);
      }
    }
  }, [currentUser, isLoadingAuth]);

  useEffect(() => {
    if (userProfile && !isLoadingAuth && !initialScoreCaptured.current) {
      setInitialScoreOnLoad(userProfile.overallPersistentScore);
      initialScoreCaptured.current = true;
    }
  }, [userProfile, isLoadingAuth]);

  useEffect(() => {
    if (userProfile && initialScoreOnLoad !== null) {
      const gained = userProfile.overallPersistentScore - initialScoreOnLoad;
      if (gained > 0) {
        setPointsGainedDisplay(gained);
      } else {
        setPointsGainedDisplay(0); // Reset if score decreased or is same
      }
    }
  }, [userProfile, initialScoreOnLoad]);


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setOwnedWordsCount(null);
      setShowOwnedWordsSparkle(false);
      setInitialScoreOnLoad(null);
      setPointsGainedDisplay(0);
      initialScoreCaptured.current = false;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(LOCALSTORAGE_OWNED_WORDS_COUNT_KEY);
      }
      router.push('/');
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
  };


  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="absolute top-0 left-0 bg-white text-red-500 text-xs font-bold p-1 z-50">
        {isMobile ? "Mobile" : isDesktop ? "PC" : "Other"}
      </div>
      <div className="container flex h-16 max-w-screen-2xl items-center">
        <Link href="/" className="flex items-center space-x-2 mr-auto">
          <BookText className="h-6 w-6 text-primary" />
          <span className="font-headline text-2xl font-bold text-primary">LexiVerse</span>
        </Link>

        <nav className="flex items-center space-x-1 sm:space-x-2">
          {currentUser && userProfile && (
            <div className="flex items-center text-muted-foreground hover:text-primary px-1 sm:px-2 text-xs sm:text-sm">
              <BadgeCent className="mr-1 h-4 sm:h-5 w-4 sm:w-5" />
              <span className="hidden sm:inline">Score:</span> 
              <span className="ml-1 font-semibold">{userProfile.overallPersistentScore}</span>
            </div>
          )}
          {currentUser && userProfile && pointsGainedDisplay > 0 && (
            <div className="flex items-center text-xs sm:text-sm text-green-600 bg-green-100 dark:bg-green-700 dark:text-green-200 px-2 py-1 rounded-md">
              <Sparkles className="mr-1 h-3 sm:h-4 w-3 sm:w-4 text-yellow-400 animate-pulse" />
              <span>+{pointsGainedDisplay} pts today!</span>
            </div>
          )}
          {currentUser && userProfile && ownedWordsCount !== null && (
            <Button variant="ghost" asChild className="text-muted-foreground hover:text-primary px-1 sm:px-2 text-xs sm:text-sm">
              <Link href="/profile" className="flex items-center">
                <FileText className="mr-1 h-4 sm:h-5 w-4 sm:w-5" />
                <span className="hidden sm:inline">Words Owned:</span> 
                <span className="ml-1 font-semibold">{ownedWordsCount}</span>
                {showOwnedWordsSparkle && <Sparkles className="ml-1 h-4 w-4 text-yellow-400 animate-pulse" />}
              </Link>
            </Button>
          )}
          

          <Button variant="ghost" asChild className="text-muted-foreground hover:text-primary px-1 sm:px-2">
            <Link href="/circles" className="flex items-center">
              <Users className="mr-1 h-4 sm:h-5 w-4 sm:w-5" /> 
              <span className="hidden sm:inline text-xs sm:text-sm">Circles</span>
            </Link>
          </Button>
          
          {currentUser && (
             <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary relative" onClick={() => router.push('/notifications')}>
              <Bell className="h-5 w-5" />
            </Button>
          )}

          {isLoadingAuth ? (
             <div className="h-8 w-20 bg-muted rounded-md animate-pulse" />
          ) : currentUser && userProfile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-auto px-1 sm:px-2 rounded-full">
                   <Avatar className="h-8 w-8">
                    <AvatarImage src={currentUser.photoURL || userProfile.photoURL || undefined} alt={userProfile.username || 'User'} />
                    <AvatarFallback>{getInitials(userProfile.username)}</AvatarFallback>
                  </Avatar>
                  <span className="ml-1 sm:ml-2 hidden sm:inline text-xs sm:text-sm">{userProfile.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userProfile.username}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {currentUser.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                {(userRole === 'admin' || userRole === 'moderator') && (
                  <DropdownMenuItem onClick={() => router.push('/admin')}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="default" onClick={() => router.push('/auth/login')}>
              <LogIn className="mr-2 h-5 w-5" /> Login
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
