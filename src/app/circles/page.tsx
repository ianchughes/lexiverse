
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import type { Circle, CircleMember, CircleMemberRole } from '@/types'; // Removed CircleInvite
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Users, Eye, Loader2, AlertTriangle, Settings } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { CircleInviteManagerDialog } from '@/components/circles/CircleInviteManagerDialog'; // Import the new dialog

interface UserCircleMembership extends Circle {
  userRoleInCircle: CircleMemberRole;
}

export default function MyCirclesPage() {
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const [myCircles, setMyCircles] = useState<UserCircleMembership[]>([]);
  const [isLoadingCircles, setIsLoadingCircles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [managingInvitesForCircleId, setManagingInvitesForCircleId] = useState<string | null>(null);
  const [managingInvitesForCircleName, setManagingInvitesForCircleName] = useState<string | null>(null);
  const [isInviteManagerOpen, setIsInviteManagerOpen] = useState(false);

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
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">You need to be logged in to view your circles.</p>
        <Button asChild>
          <Link href="/auth/login">Login</Link>
        </Button>
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
        {/* Future: Add more details here if needed, like a snippet of description */}
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

    