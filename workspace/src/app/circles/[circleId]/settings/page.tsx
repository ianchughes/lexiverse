
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import type { Circle, CircleMemberRole } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { amendCircleDetailsAction } from '@/app/circles/actions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, AlertTriangle, ArrowLeft } from 'lucide-react';

const editCircleFormSchema = z.object({
  circleName: z.string().min(3, { message: "Circle name must be at least 3 characters." }).max(50, { message: "Circle name cannot exceed 50 characters." }),
  publicDescription: z.string().max(200, { message: "Description cannot exceed 200 characters." }).optional(),
  isPublic: z.boolean().default(false),
});

type EditCircleFormValues = z.infer<typeof editCircleFormSchema>;

export default function EditCirclePage() {
  const params = useParams();
  const router = useRouter();
  const circleId = typeof params.circleId === 'string' ? params.circleId : '';
  
  const { currentUser, isLoadingAuth } = useAuth();
  const { toast } = useToast();
  
  const [circle, setCircle] = useState<Circle | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<EditCircleFormValues>({
    resolver: zodResolver(editCircleFormSchema),
    defaultValues: {
      circleName: "",
      publicDescription: "",
      isPublic: false,
    },
  });

  const fetchCircleData = useCallback(async () => {
    if (!circleId || !currentUser) {
      setIsLoadingPage(false);
      if(!currentUser && !isLoadingAuth) setError("You must be logged in to edit a circle.");
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

      // Verify user is admin of this circle
      const memberDocRef = doc(firestore, `CircleMembers/${currentUser.uid}_${circleId}`); // Or your specific member ID structure
      // A more robust way: query CircleMembers collection
      const membersQuery = query(collection(firestore, 'CircleMembers'), 
        where('circleId', '==', circleId), 
        where('userId', '==', currentUser.uid),
        where('role', '==', 'Admin')
      );
      const memberSnap = await getDocs(membersQuery);

      if (memberSnap.empty && circleData.creatorUserID !== currentUser.uid) { // Check creator too
         throw new Error("You do not have permission to edit this circle.");
      }
      
      setCircle(circleData);
      form.reset({
        circleName: circleData.circleName,
        publicDescription: circleData.publicDescription || "",
        isPublic: circleData.isPublic,
      });

    } catch (err: any) {
      console.error("Error fetching circle data:", err);
      setError(err.message || "Could not load circle data for editing.");
    } finally {
      setIsLoadingPage(false);
    }
  }, [circleId, currentUser, form, isLoadingAuth]);

  useEffect(() => {
    if (!isLoadingAuth) {
      fetchCircleData();
    }
  }, [fetchCircleData, isLoadingAuth]);


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
        router.push(`/circles/${circleId}`); // Navigate back to circle details
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
    <div className="max-w-2xl mx-auto">
      <Button variant="outline" asChild className="mb-6">
         <Link href={`/circles/${circleId}`}>
           <ArrowLeft className="mr-2 h-4 w-4" /> Back to Circle Details
        </Link>
      </Button>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">Edit Circle: {circle.circleName}</CardTitle>
          <CardDescription>
            Update the details for your circle.
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
                Save Changes
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}

