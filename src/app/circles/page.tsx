
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import type { Circle, CircleMember } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Users, Eye, Loader2, AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface UserCircleMembership extends Circle {
  userRoleInCircle: CircleMemberRole;
}

export default function MyCirclesPage() {
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const [myCircles, setMyCircles] = useState<UserCircleMembership[]>([]);
  const [isLoadingCircles, setIsLoadingCircles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoadingAuth || !currentUser) {
      if (!isLoadingAuth && !currentUser) setIsLoadingCircles(false); // Not logged in, stop loading
      return;
    }

    const fetchMyCircles = async () => {
      setIsLoadingCircles(true);
      setError(null);
      try {
        // Fetch memberships
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
              <CircleItem key={circle.id} circle={circle} />
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
    </div>
  );
}

interface CircleItemProps {
  circle: UserCircleMembership;
}

function CircleItem({ circle }: CircleItemProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="truncate text-primary">{circle.circleName}</CardTitle>
        <CardDescription>
          {circle.isPublic ? 'Public Circle' : 'Private Circle'} - {circle.memberCount} member(s)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Add more details here if needed, like a snippet of description */}
        <Button asChild className="w-full mt-2">
          <Link href={`/circles/${circle.id}`}>
            <Eye className="mr-2 h-4 w-4" /> View Circle
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

