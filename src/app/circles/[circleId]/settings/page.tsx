
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, updateDoc, query, collection, where, getDocs, orderBy } from 'firebase/firestore';
import type { Circle, CircleMember, CircleMemberRole } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { amendCircleDetailsAction, updateMemberRoleAction } from '@/app/circles/actions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, AlertTriangle, ArrowLeft, Users, ShieldCheck, Crown, UserCheck, TrendingUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

const editCircleFormSchema = z.object({
  circleName: z.string().min(3, { message: "Circle name must be at least 3 characters." }).max(50, { message: "Circle name cannot exceed 50 characters." }),
  publicDescription: z.string().max(200, { message: "Description cannot exceed 200 characters." }).optional(),
  isPublic: z.boolean().default(false),
});

type EditCircleFormValues = z.infer<typeof editCircleFormSchema>;

// Helper function to get initials
const getInitials = (name?: string) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

export default function EditCirclePage() {
  const params = useParams();
  const router = useRouter();
  const circleId = typeof params.circleId === 'string' ? params.circleId : '';
  
  const { currentUser, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingMemberRole, setProcessingMemberRole] = useState<string | null>(null);


  const form = useForm<EditCircleFormValues>({
    resolver: zodResolver(editCircleFormSchema),
    defaultValues: {
      circleName: "",
      publicDescription: "",
      isPublic: false,
    },
  });

  const fetchCircleAndMembersData = useCallback(async () => {
    if (!circleId || !currentUser) {
      setIsLoadingPage(false);
      if(!currentUser && !isLoadingAuth) setError("You must be logged in to manage a circle.");
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
      const circleData = circleSnap.data() as Circle;
      setCircle(circleData);
      form.reset({
        circleName: circleData.circleName,
        publicDescription: circleData.publicDescription || "",
        isPublic: circleData.isPublic,
      });

      // Fetch members
      const membersQuery = query(
        collection(firestore, 'CircleMembers'), 
        where('circleId', '==', circleId),
        orderBy('dateJoined', 'asc') // Optional: order by join date
      );
      const membersSnap = await getDocs(membersQuery);
      const fetchedMembers: CircleMember[] = [];
      let currentUserIsAdmin = false;
      membersSnap.forEach(docSnap => {
        const member = { id: docSnap.id, ...docSnap.data() } as CircleMember;
        fetchedMembers.push(member);
        if (member.userId === currentUser.uid && member.role === 'Admin') {
          currentUserIsAdmin = true;
        }
      });
      setMembers(fetchedMembers);

      if (!currentUserIsAdmin && circleData.creatorUserID !== currentUser.uid) {
         throw new Error("You do not have permission to manage this circle.");
      }

    } catch (err: any) {
      console.error("Error fetching circle/members data:", err);
      setError(err.message || "Could not load circle data for management.");
    } finally {
      setIsLoadingPage(false);
    }
  }, [circleId, currentUser, form, isLoadingAuth]);

  useEffect(() => {
    if (!isLoadingAuth) {
      fetchCircleAndMembersData();
    }
  }, [fetchCircleAndMembersData, isLoadingAuth]);


  async function onSubmit(values: EditCircleFormValues) {
    if (!currentUser || !circleId || !circle) {
      toast({ title: "Error", description: "Cannot submit form. User or circle data missing.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await amendCircleDetailsAction({
        circleId: circleId,
        requestingUserId: currentUser.uid,
        newData: {
          circleName: values.circleName,
          isPublic: values.isPublic,
          publicDescription: values.publicDescription || "",
        }
      });

      if (result.success) {
        toast({
          title: "Circle Updated!",
          description: `Circle "${values.circleName}" has been successfully updated.`,
        });
        // Optionally re-fetch data if circleName change affects header
        setCircle(prev => prev ? {...prev, ...values} : null);
      } else {
        throw new Error(result.error || "Failed to update circle.");
      }
    } catch (error: any) {
      console.error("Update circle error:", error);
      toast({
        title: "Update Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleRoleChange = async (targetUserId: string, newRole: 'Member' | 'Influencer') => {
    if (!currentUser || !circleId) return;
    setProcessingMemberRole(targetUserId);
    try {
      const result = await updateMemberRoleAction({
        circleId,
        requestingUserId: currentUser.uid,
        targetUserId,
        newRole
      });
      if (result.success) {
        toast({ title: "Role Updated", description: `Member's role changed to ${newRole}.`});
        fetchCircleAndMembersData(); // Refresh member list
      } else {
        throw new Error(result.error || "Failed to update role.");
      }
    } catch (error: any) {
       toast({ title: "Role Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setProcessingMemberRole(null);
    }
  };
  
  const getRoleIcon = (role: CircleMemberRole) => {
    if (role === 'Admin') return <Crown className="h-4 w-4 text-primary" />;
    if (role === 'Influencer') return <TrendingUp className="h-4 w-4 text-accent" />;
    return <UserCheck className="h-4 w-4 text-muted-foreground" />;
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
          <Link href={circleId ? `/circles/${circleId}` : "/circles"}>
             <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Link>
        </Button>
      </div>
    );
  }
  
  if (!circle) {
     return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Circle data could not be loaded.</p>
         <Button asChild variant="outline" className="mt-4">
          <Link href="/circles">
             <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Circles
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Button variant="outline" asChild className="mb-6 print:hidden">
         <Link href={`/circles/${circleId}`}>
           <ArrowLeft className="mr-2 h-4 w-4" /> Back to Circle Details
        </Link>
      </Button>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">Settings for: {circle.circleName}</CardTitle>
          <CardDescription>
            Update the details and manage members for your circle.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="circleName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Circle Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="publicDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Public Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                     <FormDescription>
                      This will be visible if your circle is public. Max 200 characters.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Circle is Public?
                      </FormLabel>
                      <FormDescription>
                        Public circles can be discovered. Private circles are invite-only.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-5 w-5" />
                )}
                Save General Settings
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Separator />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center"><Users className="mr-2" /> Manage Members</CardTitle>
          <CardDescription>Promote members to 'Influencer' to allow them to invite others, or demote them.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground">No members in this circle yet (besides you).</p>
          ) : (
            <div className="space-y-4">
              {members.filter(m => m.userId !== currentUser?.uid).map(member => ( // Exclude current user (admin) from list
                <div key={member.userId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md bg-muted/20 gap-3">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.photoURL} />
                      <AvatarFallback>{getInitials(member.username)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.username}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {getRoleIcon(member.role)} {member.role}
                      </div>
                    </div>
                  </div>
                  {member.role !== 'Admin' && ( // Prevent changing Admin role here
                    <Select
                      value={member.role}
                      onValueChange={(newRole: 'Member' | 'Influencer') => handleRoleChange(member.userId, newRole)}
                      disabled={processingMemberRole === member.userId}
                    >
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Change role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Member">Member</SelectItem>
                        <SelectItem value="Influencer">Influencer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {member.role === 'Admin' && (
                    <Badge variant="secondary">Admin (Creator)</Badge>
                  )}
                  {processingMemberRole === member.userId && <Loader2 className="h-5 w-5 animate-spin" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">Admins (circle creators) cannot have their role changed here.</p>
        </CardFooter>
      </Card>

    </div>
  );
}
