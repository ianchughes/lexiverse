
'use client';

import { useState, useEffect, Suspense } from 'react'; 
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import type { Circle, CircleMember, CircleMemberRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { PlusCircle, Users, Eye, Loader2, AlertTriangle, Settings, LogIn, UserPlus, Info, Handshake } from 'lucide-react'; 
import { Separator } from '@/components/ui/separator';
import { CircleInviteManagerDialog } from '@/components/circles/CircleInviteManagerDialog';
import { useSearchParams } from 'next/navigation'; 

interface UserCircleMembership extends Circle {
  userRoleInCircle: CircleMemberRole;
}

function MyCirclesPageContent() {
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const [myCircles, setMyCircles] = useState<UserCircleMembership[]>([]);
  const [isLoadingCircles, setIsLoadingCircles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [managingInvitesForCircleId, setManagingInvitesForCircleId] = useState<string | null>(null);
  const [managingInvitesForCircleName, setManagingInvitesForCircleName] = useState<string | null>(null);
  const [isInviteManagerOpen, setIsInviteManagerOpen] = useState(false);

  const searchParams = useSearchParams();
  const inviteCodeFromUrl = searchParams.get('code');

  useEffect(() => {
    if (isLoadingAuth || !currentUser) {
      if (!isLoadingAuth && !currentUser) setIsLoadingCircles(false);
      return;
    }

    const fetchMyCircles = async () => {
      setIsLoadingCircles(true);
      setError(null);
      try {
        const membershipsQuery = query(collection(firestore, 'CircleMembers'), where('userId', '==', currentUser.uid));
        const membershipsSnap = await getDocs(membershipsQuery);

        const circlePromises = membershipsSnap.docs.map(async (memberDoc) => {
          const memberData = memberDoc.data() as CircleMember;
          const circleDocRef = doc(firestore, 'Circles', memberData.circleId);
          const circleSnap = await getDoc(circleDocRef);
          if (circleSnap.exists()) {
            return {
              ...(circleSnap.data() as Circle),
              id: circleSnap.id,
              userRoleInCircle: memberData.role
            } as UserCircleMembership;
          }
          return null;
        });

        const resolvedCircles = (await Promise.all(circlePromises)).filter(c => c !== null) as UserCircleMembership[];
        setMyCircles(resolvedCircles);

      } catch (err) {
        console.error("Error fetching circles:", err);
        setError("Could not load your circles. Please try again later.");
      } finally {
        setIsLoadingCircles(false);
      }
    };

    fetchMyCircles();
  }, [currentUser, isLoadingAuth]);

  const openInviteManager = (circleId: string, circleName: string) => {
    setManagingInvitesForCircleId(circleId);
    setManagingInvitesForCircleName(circleName);
    setIsInviteManagerOpen(true);
  };

  if (isLoadingAuth || isLoadingCircles) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-12">
        <Card className="w-full max-w-xl text-center shadow-xl">
          <CardHeader className="pt-8">
            <Handshake className="mx-auto h-16 w-16 text-primary mb-4" />
            <CardTitle className="text-3xl md:text-4xl font-headline text-primary">
              Eager to Dive into LexiVerse Teams? Awesome! 🤝
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 px-6 md:px-8 pb-8">
            <p className="text-muted-foreground text-lg leading-relaxed">
              We see you're ready to explore LexiVerse Teams – that's fantastic! Circles are where you can team up with friends, combine your daily scores, and climb the leaderboards together. It's a core part of the fun!
            </p>
            <p className="text-lg text-foreground">
              To create, join, or manage your Circles, we just need to know who you are first.
            </p>
            <div className="text-lg text-foreground">
              New to LexiVerse? It only takes a moment to{' '}
              <Button variant="link" asChild className="p-0 h-auto text-lg text-accent">
                <Link href={`/auth/register${inviteCodeFromUrl ? `?inviteCode=${inviteCodeFromUrl}` : ''}`}>Create Your Free Account</Link>
              </Button>
              {' '}and get started!
              <br />
              Already have an account? Please{' '}
              <Button variant="link" asChild className="p-0 h-auto text-lg text-accent">
                <Link href={`/auth/login${inviteCodeFromUrl ? `?inviteCode=${inviteCodeFromUrl}` : ''}`}>Log In</Link>
              </Button>
              {' '}to access your Circles.
            </div>

            {inviteCodeFromUrl ? (
              <div className="mt-6 p-4 bg-accent/10 border border-accent/30 rounded-lg">
                <Info className="inline h-5 w-5 mr-2 text-accent mb-1" />
                <p className="text-sm text-accent-foreground">
                  It looks like you were trying to join a specific Circle using an invite! Once you've signed up or logged in, if you're not automatically taken to the Circle, you can use the invite code: <strong className="font-mono bg-muted px-1 rounded">{inviteCodeFromUrl}</strong> or simply try your original invite link again. We'll make sure you get to the right place!
                </p>
              </div>
            ) : (
              <p className="mt-4 text-muted-foreground">
                Once you're in, you can easily create your own Circle or browse for existing ones to join!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  const ownedCircles = myCircles.filter(c => c.userRoleInCircle === 'Admin');
  const memberCircles = myCircles.filter(c => c.userRoleInCircle === 'Member');

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Circles</h1>
          <p className="text-muted-foreground mt-1">
            Manage circles you own or are a member of.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/circles/create">
            <PlusCircle className="mr-2 h-5 w-5" /> Create New Circle
          </Link>
        </Button>
      </div>

      {myCircles.length === 0 && (
        <Card className="text-center py-10">
          <CardHeader>
            <Users className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <CardTitle className="text-2xl">No Circles Yet!</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-6">
              You haven't created or joined any circles. Why not start one?
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {ownedCircles.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4">Circles I Administer</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ownedCircles.map(circle => (
              <CircleItem
                key={circle.id}
                circle={circle}
                onManageInvites={() => openInviteManager(circle.id, circle.circleName)}
              />
            ))}
          </div>
        </section>
      )}

      {memberCircles.length > 0 && (
        <section>
          {ownedCircles.length > 0 && <Separator className="my-8" />}
          <h2 className="text-2xl font-semibold mb-4">Circles I'm In</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {memberCircles.map(circle => (
              <CircleItem key={circle.id} circle={circle} />
            ))}
          </div>
        </section>
      )}
       <Button variant="link" asChild className="mt-8 mx-auto block">
        <Link href="/circles/join">Join a Circle with an Invite Code</Link>
      </Button>

      <CircleInviteManagerDialog
        isOpen={isInviteManagerOpen}
        onOpenChange={setIsInviteManagerOpen}
        circleId={managingInvitesForCircleId}
        circleName={managingInvitesForCircleName}
      />
    </div>
  );
}


interface CircleItemProps {
  circle: UserCircleMembership;
  onManageInvites?: () => void;
}

function CircleItem({ circle, onManageInvites }: CircleItemProps) {
  const isCurrentUserAdmin = circle.userRoleInCircle === 'Admin';
  return (
    <Card className="hover:shadow-lg transition-shadow flex flex-col">
      <CardHeader>
        <CardTitle className="truncate text-primary">{circle.circleName}</CardTitle>
        <CardDescription>
          {circle.isPublic ? 'Public Circle' : 'Private Circle'} - {circle.memberCount} member(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-2 h-10">
            {circle.publicDescription || "No description provided."}
        </p>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center pt-4 border-t">
          <Button asChild className="w-full sm:flex-grow">
            <Link href={`/circles/${circle.id}`}>
              <Eye className="mr-2 h-4 w-4" /> View
            </Link>
          </Button>
          {isCurrentUserAdmin && onManageInvites && (
            <Button variant="outline" onClick={onManageInvites} className="w-full sm:flex-grow">
              <Settings className="mr-2 h-4 w-4" /> Manage Invites
            </Button>
          )}
      </CardFooter>
    </Card>
  );
}

export default function MyCirclesPageWrapper() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
      <MyCirclesPageContent />
    </Suspense>
  )
}

