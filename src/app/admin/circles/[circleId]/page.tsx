
'use client';
// This page is a placeholder for viewing/editing specific circle details by an admin.
// Full implementation would involve fetching all circle data, member lists, scores,
// and providing forms/actions to manage them as per spec (3.2 - 3.6).

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { Circle, CircleMember, CircleMemberRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, ArrowLeft, Users, Settings, Edit3, AlertTriangle, Crown, TrendingUp, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

// Helper function to get initials
const getInitials = (name?: string) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

export default function AdminCircleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const circleId = typeof params.circleId === 'string' ? params.circleId : '';
  const { currentUser, userRole, isLoadingAuth } = useAuth();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!circleId || isLoadingAuth) return;
    if (!currentUser || (userRole !== 'admin' && userRole !== 'moderator')) {
      setError("You don't have permission to view this page.");
      setIsLoadingPage(false);
      return;
    }

    setIsLoadingPage(true);
    setError(null);
    try {
      // Fetch Circle
      const circleDocRef = doc(firestore, 'Circles', circleId);
      const circleSnap = await getDoc(circleDocRef);
      if (!circleSnap.exists()) throw new Error("Circle not found.");
      setCircle({ id: circleSnap.id, ...circleSnap.data() } as Circle);

      // Fetch Members
      const membersQuery = query(collection(firestore, 'CircleMembers'), where('circleId', '==', circleId));
      const membersSnap = await getDocs(membersQuery);
      setMembers(membersSnap.docs.map(d => d.data() as CircleMember));

    } catch (err: any) {
      console.error("Error fetching circle data for admin:", err);
      setError(err.message || "Could not load circle data.");
    } finally {
      setIsLoadingPage(false);
    }
  }, [circleId, currentUser, userRole, isLoadingAuth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const getRoleBadge = (role: CircleMemberRole) => {
    switch (role) {
      case 'Admin': return <Badge className="bg-primary/20 text-primary flex items-center gap-1"><Crown className="h-3 w-3" />Admin</Badge>;
      case 'Influencer': return <Badge className="bg-accent/20 text-accent-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Influencer</Badge>;
      case 'Member': return <Badge variant="secondary" className="flex items-center gap-1"><UserCheck className="h-3 w-3" />Member</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };

  if (isLoadingAuth || isLoadingPage) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10 max-w-lg mx-auto">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Error</h2>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button asChild variant="outline">
          <Link href="/admin/circles">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Circle Management
          </Link>
        </Button>
      </div>
    );
  }
  
  if (!circle) {
     return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Circle data could not be loaded or not found.</p>
         <Button asChild variant="outline" className="mt-4">
           <Link href="/admin/circles">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Circle Management
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <Button variant="outline" asChild className="mb-6">
         <Link href="/admin/circles">
           <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Circles
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Circle Details: {circle.circleName}</CardTitle>
          <CardDescription>Admin view for circle ID: {circle.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p><strong>Creator UID:</strong> {circle.creatorUserID}</p>
          <p><strong>Date Created:</strong> {format(circle.dateCreated.toDate(), 'PPP p')}</p>
          <p><strong>Status:</strong> <span className="font-semibold">{circle.status}</span></p>
          <p><strong>Public:</strong> {circle.isPublic ? 'Yes' : 'No'}</p>
          <p><strong>Member Count:</strong> {circle.memberCount}</p>
          {circle.publicDescription && <p><strong>Description:</strong> {circle.publicDescription}</p>}
          <p><strong>Invite Code:</strong> <span className="font-mono bg-muted px-1 rounded">{circle.inviteLinkCode}</span></p>
          {/* Add more fields as necessary */}
        </CardContent>
        {/* <CardFooter>
          <Button variant="outline"><Edit3 className="mr-2 h-4 w-4" /> Edit Circle (Admin Action)</Button>
        </CardFooter> */}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? <p>No members in this circle.</p> : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {members.map(member => (
                 <div key={member.userId} className="flex items-center justify-between p-3 bg-muted/20 rounded-md">
                    <div className="flex items-center space-x-3">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={member.photoURL} />
                        <AvatarFallback>{getInitials(member.username)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="font-medium">{member.username} <span className="text-xs text-muted-foreground">({member.userId.substring(0,8)}...)</span></p>
                        <p className="text-xs text-muted-foreground">Joined: {format(member.dateJoined.toDate(), 'PP')}</p>
                    </div>
                    </div>
                    {getRoleBadge(member.role)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle>Circle Scores (Admin View)</CardTitle></CardHeader>
        <CardContent>
            <p className="text-muted-foreground">Detailed score data (Daily, Weekly, Monthly totals) would be displayed here for admin review.</p>
            {/* Fetch and display from CircleDailyScores, CircleWeeklyScores, CircleMonthlyScores */}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Further admin actions like editing circle details directly, managing members (remove, change role),
        and viewing detailed score logs would be implemented here.
      </p>
    </div>
  );
}
