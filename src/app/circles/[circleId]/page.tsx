
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc, updateDoc, arrayRemove, arrayUnion, serverTimestamp, increment } from 'firebase/firestore';
import type { CircleWithDetails, Circle, CircleMember, CircleMemberRole, UserProfile, CircleDailyScore, CircleInvite } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Settings, LogOut, Trash2, UserPlus, Link2, AlertTriangle, Copy, Check, Mail, UserSearch, Crown, TrendingUp, UserCheck } from 'lucide-react';
import { leaveCircleAction, deleteCircleAction, sendCircleInviteAction } from '@/app/circles/actions';
import { format } from 'date-fns';

// Helper function to get initials
const getInitials = (name?: string) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

export default function CircleDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const circleId = typeof params.circleId === 'string' ? params.circleId : '';
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const { toast } = useToast();

  const [circleDetails, setCircleDetails] = useState<CircleWithDetails | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteType, setInviteType] = useState<'username' | 'email'>('username');
  const [inviteeIdentifier, setInviteeIdentifier] = useState(''); // For username or email
  const [isInviting, setIsInviting] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);


  const fetchCircleDetails = useCallback(async () => {
    if (!circleId) {
      setError("Circle ID is missing.");
      setIsLoadingPage(false);
      return;
    }
    setIsLoadingPage(true);
    setError(null);
    try {
      const circleDocRef = doc(firestore, 'Circles', circleId);
      const circleSnap = await getDoc(circleDocRef);

      if (!circleSnap.exists()) {
        throw new Error("Circle not found.");
      }
      const circleData = { ...circleSnap.data(), id: circleSnap.id } as Circle;

      const membersQuery = query(collection(firestore, 'CircleMembers'), where('circleId', '==', circleId));
      const membersSnap = await getDocs(membersQuery);
      const members = membersSnap.docs.map(d => ({ ...d.data(), id: d.id } as CircleMember));

      let currentUserRoleInCircle: CircleMemberRole | undefined = undefined;
      if (currentUser) {
        const member = members.find(m => m.userId === currentUser.uid);
        if (member) currentUserRoleInCircle = member.role;
      }
      
      const todayGMT = format(new Date(), 'yyyy-MM-dd');
      const dailyScoreId = `${todayGMT}_${circleId}`;
      const dailyScoreDocRef = doc(firestore, 'CircleDailyScores', dailyScoreId);
      const dailyScoreSnap = await getDoc(dailyScoreDocRef);
      let dailyScoreData: CircleDailyScore | undefined = undefined;
      if(dailyScoreSnap.exists()) {
        dailyScoreData = dailyScoreSnap.data() as CircleDailyScore;
      }

      setCircleDetails({
        ...circleData,
        members,
        currentUserRole: currentUserRoleInCircle,
        scores: {
          daily: dailyScoreData,
        }
      });

    } catch (err: any) {
      console.error("Error fetching circle details:", err);
      setError(err.message || "Could not load circle details.");
    } finally {
      setIsLoadingPage(false);
    }
  }, [circleId, currentUser]);

  useEffect(() => {
    fetchCircleDetails();
  }, [fetchCircleDetails]);

  const handleLeaveCircle = async () => {
    if (!currentUser || !circleDetails) return;
    if (!confirm(`Are you sure you want to leave "${circleDetails.circleName}"?`)) return;

    try {
      const result = await leaveCircleAction({ circleId: circleDetails.id, userId: currentUser.uid });
      if (result.success) {
        toast({ title: "Left Circle", description: `You have left "${circleDetails.circleName}".` });
        router.push('/circles');
      } else {
        throw new Error(result.error || "Failed to leave circle.");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteCircle = async () => {
    if (!currentUser || !circleDetails || circleDetails.currentUserRole !== 'Admin') return;
    if (!confirm(`DELETE CIRCLE: Are you absolutely sure you want to delete "${circleDetails.circleName}"? This action CANNOT be undone and all members will be removed.`)) return;
    
    try {
      const result = await deleteCircleAction({ circleId: circleDetails.id, requestingUserId: currentUser.uid });
       if (result.success) {
        toast({ title: "Circle Deleted", description: `"${circleDetails.circleName}" has been deleted.` });
        router.push('/circles');
      } else {
        throw new Error(result.error || "Failed to delete circle.");
      }
    } catch (err: any) {
       toast({ title: "Error Deleting Circle", description: err.message, variant: "destructive" });
    }
  };

  const handleSendInvite = async () => {
    if (!currentUser || !userProfile || !circleDetails || !inviteeIdentifier.trim()) return;
    setIsInviting(true);
    
    let payload: Parameters<typeof sendCircleInviteAction>[0] = {
        circleId: circleDetails.id,
        circleName: circleDetails.circleName,
        inviterUserId: currentUser.uid,
        inviterUsername: userProfile.username,
    };

    if (inviteType === 'username') {
      payload.inviteeUsername = inviteeIdentifier.trim();
    } else { // email
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeIdentifier.trim())) {
        toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
        setIsInviting(false);
        return;
      }
      payload.inviteeEmail = inviteeIdentifier.trim();
    }

    try {
      const result = await sendCircleInviteAction(payload);

      if (result.success) {
        toast({ title: "Invite Sent!", description: `Invitation sent to ${inviteeIdentifier.trim()}.` });
        setInviteeIdentifier('');
        setShowInviteDialog(false);
      } else {
        throw new Error(result.error || "Failed to send invite.");
      }
    } catch (err: any) {
      toast({ title: "Invite Error", description: err.message, variant: "destructive" });
    } finally {
      setIsInviting(false);
    }
  };
  
  const copyInviteLink = () => {
    if (!circleDetails?.inviteLinkCode) return;
    const link = `${window.location.origin}/circles/join?code=${circleDetails.inviteLinkCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setInviteLinkCopied(true);
      toast({ title: "Invite Link Copied!"});
      setTimeout(() => setInviteLinkCopied(false), 2000);
    }).catch(err => {
      toast({title: "Error", description: "Could not copy link.", variant: "destructive"});
    });
  };


  if (isLoadingAuth || isLoadingPage) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Error Loading Circle</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button asChild variant="outline">
          <Link href="/circles">Back to My Circles</Link>
        </Button>
      </div>
    );
  }
  
  if (!circleDetails) {
     return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-muted mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Circle Not Found</h2>
        <p className="text-muted-foreground mb-4">The circle you are looking for does not exist or you may not have permission to view it.</p>
        <Button asChild variant="outline">
          <Link href="/circles">Back to My Circles</Link>
        </Button>
      </div>
    );
  }
  
  const canManageSettings = circleDetails.currentUserRole === 'Admin';
  const canInviteMembers = circleDetails.currentUserRole === 'Admin' || circleDetails.currentUserRole === 'Influencer';

  const getRoleBadge = (role: CircleMemberRole) => {
    switch (role) {
      case 'Admin': return <Badge className="bg-primary/20 text-primary flex items-center gap-1"><Crown className="h-3 w-3" />Admin</Badge>;
      case 'Influencer': return <Badge className="bg-accent/20 text-accent-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Influencer</Badge>;
      case 'Member': return <Badge variant="secondary" className="flex items-center gap-1"><UserCheck className="h-3 w-3" />Member</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      <Card className="shadow-xl">
        <CardHeader className="bg-muted/30 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <CardTitle className="text-3xl md:text-4xl font-headline text-primary">{circleDetails.circleName}</CardTitle>
              <CardDescription className="text-lg mt-1">
                {circleDetails.isPublic ? 'Public Circle' : 'Private Circle'}
                {circleDetails.publicDescription && ` - ${circleDetails.publicDescription}`}
              </CardDescription>
              <p className="text-sm text-muted-foreground mt-2">Created by: {circleDetails.members.find(m => m.userId === circleDetails.creatorUserID)?.username || 'Unknown'}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
               {canManageSettings && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/circles/${circleId}/settings`}>
                    <Settings className="mr-2 h-4 w-4" /> Circle Settings
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
            <div className="mb-6 p-4 border rounded-lg bg-background">
                <h3 className="text-xl font-semibold mb-2 text-accent">Circle Stats</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                        <p className="text-2xl font-bold">{circleDetails.members.length}</p>
                        <p className="text-sm text-muted-foreground">Members</p>
                    </div>
                     <div>
                        <p className="text-2xl font-bold">{circleDetails.scores?.daily?.dailyTotalScore || 0}</p>
                        <p className="text-sm text-muted-foreground">Today's Score</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-muted-foreground">N/A</p>
                        <p className="text-sm text-muted-foreground">Weekly Score</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-muted-foreground">N/A</p>
                        <p className="text-sm text-muted-foreground">Monthly Score</p>
                    </div>
                </div>
            </div>

          <Tabs defaultValue="members" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 mb-4">
              <TabsTrigger value="members">Members ({circleDetails.members.length})</TabsTrigger>
              <TabsTrigger value="scores">Scores</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle>Member List</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                  {circleDetails.members.map(member => (
                    <div key={member.userId} className="flex items-center justify-between p-3 bg-muted/20 rounded-md">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10">
                           <AvatarImage src={member.photoURL} />
                           <AvatarFallback>{getInitials(member.username)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.username}</p>
                          <p className="text-xs text-muted-foreground">Joined: {format(member.dateJoined.toDate(), 'PP')}</p>
                        </div>
                      </div>
                      {getRoleBadge(member.role)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="scores">
               <Card>
                <CardHeader><CardTitle>Score Details</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Detailed score breakdowns and leaderboards will be shown here.</p>
                </CardContent>
              </Card>
            </TabsContent>
             <TabsContent value="activity">
               <Card>
                <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Circle activity feed (new members, achievements) will appear here.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="p-6 flex flex-col sm:flex-row justify-between items-center gap-3 border-t">
            <div className="flex gap-2">
                {canInviteMembers && (
                    <Button variant="default" onClick={() => setShowInviteDialog(true)}>
                        <UserPlus className="mr-2 h-4 w-4" /> Invite Members
                    </Button>
                )}
            </div>
           
            <div className="flex gap-2">
                {circleDetails.currentUserRole && circleDetails.currentUserRole !== 'Admin' && (
                    <Button variant="destructive" onClick={handleLeaveCircle}>
                    <LogOut className="mr-2 h-4 w-4" /> Leave Circle
                    </Button>
                )}
                {canManageSettings && (
                     <Button variant="destructive" onClick={handleDeleteCircle}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Circle
                    </Button>
                )}
            </div>
        </CardFooter>
      </Card>

      <Dialog open={showInviteDialog} onOpenChange={(open) => { setShowInviteDialog(open); if (!open) setInviteeIdentifier(''); }}>
          <DialogContent>
            <DialogHeader>
                <DialogTitle>Invite to "{circleDetails.circleName}"</DialogTitle>
                <DialogDescription>
                Invite users by their username or email address, or share an invite link.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-3">
                <RadioGroup defaultValue="username" value={inviteType} onValueChange={(value: 'username' | 'email') => { setInviteType(value); setInviteeIdentifier(''); }}>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="username" id="r-username" />
                        <Label htmlFor="r-username" className="flex items-center gap-2"><UserSearch /> Invite by Username</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="email" id="r-email" />
                        <Label htmlFor="r-email" className="flex items-center gap-2"><Mail /> Invite by Email</Label>
                    </div>
                </RadioGroup>
                <div>
                    <Label htmlFor="inviteeIdentifier" className="sr-only">{inviteType === 'username' ? 'Username' : 'Email Address'}</Label>
                    <div className="flex gap-2 mt-1">
                        <Input 
                        id="inviteeIdentifier" 
                        value={inviteeIdentifier} 
                        onChange={(e) => setInviteeIdentifier(e.target.value)}
                        placeholder={inviteType === 'username' ? 'Enter username' : 'Enter email address'}
                        type={inviteType === 'email' ? 'email' : 'text'}
                        disabled={isInviting}
                        />
                        <Button onClick={handleSendInvite} disabled={!inviteeIdentifier.trim() || isInviting}>
                        {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send Invite
                        </Button>
                    </div>
                </div>
                <div className="text-center text-sm text-muted-foreground">OR</div>
                <div>
                    <Label>Share Invite Link</Label>
                    <div className="flex items-center gap-2 mt-1 p-2 border rounded-md bg-muted">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <input 
                        type="text" 
                        readOnly 
                        value={`${window.location.origin}/circles/join?code=${circleDetails.inviteLinkCode}`} 
                        className="text-xs bg-transparent flex-grow outline-none"
                    />
                    <Button variant="ghost" size="icon" onClick={copyInviteLink} title="Copy invite link">
                        {inviteLinkCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
      </Dialog>

       {(circleDetails.members.length < 3 && currentUser && canInviteMembers) && (
        <Card className="mt-6 bg-accent/30 border-accent">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold text-accent-foreground">Boost Our Circle!</h3>
            <p className="text-sm text-accent-foreground/80 mt-1 mb-3">
              Our Circle "{circleDetails.circleName}" has {circleDetails.members.length} member(s)! Invite friends to boost our score and climb the leaderboards!
            </p>
            <Button variant="default" onClick={() => setShowInviteDialog(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Invite Friends
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
