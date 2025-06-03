
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, AlertTriangle, UserCircle, Edit3 } from 'lucide-react';
import { format } from 'date-fns';

// Helper function to get initials
const getInitials = (name?: string) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

export default function ProfilePage() {
  const { currentUser, userProfile, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser || !userProfile) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">
          You need to be logged in to view your profile.
        </p>
        <Button asChild>
          <Link href="/auth/login">Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-primary ring-offset-2 ring-offset-background">
            <AvatarImage src={currentUser.photoURL || undefined} alt={userProfile.username} />
            <AvatarFallback className="text-3xl">{getInitials(userProfile.username)}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-3xl font-headline">{userProfile.username}</CardTitle>
          <CardDescription className="text-lg">{currentUser.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">Overall Score</p>
              <p className="text-xl text-foreground">{userProfile.overallPersistentScore}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">WotD Streak</p>
              <p className="text-xl text-foreground">{userProfile.wotdStreakCount || 0}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">Country</p>
              <p className="text-xl text-foreground">{userProfile.registrationCountry}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">Joined</p>
              <p className="text-xl text-foreground">{format(userProfile.dateCreated.toDate(), 'PPP')}</p>
            </div>
             <div className="p-3 bg-muted/50 rounded-md md:col-span-2">
              <p className="font-semibold text-muted-foreground">Account Status</p>
              <p className="text-xl text-foreground">{userProfile.accountStatus}</p>
            </div>
          </div>
           <div className="pt-4 text-center">
             <Button variant="outline" disabled>
                <Edit3 className="mr-2 h-4 w-4" /> Edit Profile (Coming Soon)
             </Button>
           </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground text-center">
        More profile settings and customization options will be available here in the future.
      </p>
    </div>
  );
}
