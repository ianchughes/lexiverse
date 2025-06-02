
'use client';
import Link from 'next/link';
import { BookText, Users, LogIn, LogOut, UserCircle, ShieldCheck, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
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

export function SiteHeader() {
  const { currentUser, userProfile, userRole, isLoadingAuth } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/'); // Redirect to home or login page
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
      <div className="container flex h-16 max-w-screen-2xl items-center">
        <Link href="/" className="flex items-center space-x-2 mr-auto">
          <BookText className="h-6 w-6 text-primary" />
          <span className="font-headline text-2xl font-bold text-primary">Lexiverse</span>
        </Link>

        <nav className="flex items-center space-x-3">
          <Button variant="ghost" asChild className="text-muted-foreground hover:text-primary">
            <Link href="/circles">
              <Users className="mr-1 h-5 w-5" /> Circles
            </Link>
          </Button>
          
          {/* Placeholder for notifications */}
          {currentUser && (
             <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary relative" onClick={() => router.push('/notifications')}>
              <Bell className="h-5 w-5" />
              {/* Add a badge for unread notifications later */}
            </Button>
          )}

          {isLoadingAuth ? (
             <div className="h-8 w-20 bg-muted rounded-md animate-pulse" />
          ) : currentUser && userProfile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-auto px-2 rounded-full">
                   <Avatar className="h-8 w-8">
                    <AvatarImage src={currentUser.photoURL || undefined} alt={userProfile.username || 'User'} />
                    <AvatarFallback>{getInitials(userProfile.username)}</AvatarFallback>
                  </Avatar>
                  <span className="ml-2 hidden sm:inline">{userProfile.username}</span>
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
