
'use client';

import { Suspense, useState, useEffect } from 'react'; // Added useEffect
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { joinCircleWithInviteCodeAction } from '@/app/circles/actions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus, AlertTriangle, Handshake, Info, UsersRound } from 'lucide-react';
import Link from 'next/link';

const joinCircleFormSchema = z.object({
  inviteCode: z.string().min(6, { message: "Invite code must be at least 6 characters." }).max(20, { message: "Invite code seems too long." }),
});

type JoinCircleFormValues = z.infer<typeof joinCircleFormSchema>;

function JoinCircleFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get inviteCodeFromUrl once and use it. Default to empty string if not present.
  const inviteCodeFromUrl = searchParams.get('code') || '';

  const form = useForm<JoinCircleFormValues>({
    resolver: zodResolver(joinCircleFormSchema),
    defaultValues: {
      inviteCode: inviteCodeFromUrl, // Pre-fill from URL if available
    },
  });
  
  // Effect to update form if inviteCodeFromUrl changes (e.g., SPA navigation updates params)
  useEffect(() => {
    if (inviteCodeFromUrl && form.getValues("inviteCode") !== inviteCodeFromUrl) {
      form.reset({ inviteCode: inviteCodeFromUrl });
    }
  }, [inviteCodeFromUrl, form]);


  async function onSubmit(values: JoinCircleFormValues) {
    if (!currentUser || !userProfile) {
      toast({ title: "Authentication Required", description: "Hello new friend, to join a circle, please first Login or register by clicking the button below.", variant: "destructive" });
      router.push(`/auth/login?inviteCode=${values.inviteCode}&redirect=/circles/join%3Fcode=${values.inviteCode}`);
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await joinCircleWithInviteCodeAction({
        inviteCode: values.inviteCode,
        userId: currentUser.uid,
        username: userProfile.username,
      });

      if (result.success && result.circleId) {
        toast({
          title: "Joined Circle!",
          description: `You have successfully joined the circle.`,
        });
        router.push(`/circles/${result.circleId}`);
      } else {
        throw new Error(result.error || "Failed to join circle. The code might be invalid or expired.");
      }
    } catch (error: any) {
      console.error("Join circle error:", error);
      toast({
        title: "Join Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingAuth) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }

  if (!currentUser) {
    // This is the UI for unauthenticated users with an invite link.
    return (
      <div className="flex items-center justify-center min-h-screen py-12 bg-gradient-to-br from-background to-secondary/20 px-4">
        <Card className="w-full max-w-lg shadow-2xl text-center">
          <CardHeader className="pt-8">
            <Handshake className="mx-auto h-16 w-16 text-primary mb-4" />
            <CardTitle className="text-3xl md:text-4xl font-headline text-primary">
              🎉 Get Ready for LexiVerse! Your Friend Wants You on Their Team! 🎉
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 px-6 md:px-8 pb-8">
            <p className="text-muted-foreground text-lg leading-relaxed">
              Welcome! You've been invited to join a Circle in LexiVerse!
            </p>
            <div className="text-left p-4 bg-muted/50 rounded-lg space-y-3">
              <h3 className="text-xl font-semibold text-foreground text-center mb-3">What is LexiVerse?</h3>
              <p><Info className="inline h-5 w-5 mr-2 text-accent" />LexiVerse is a daily word game where you get 9 letters and just 90 seconds to find as many words as you can. Discover the special "Word of the Day" to double your score, and even "own" rare words to earn points when others find them!</p>
              <h3 className="text-xl font-semibold text-foreground text-center mt-4 mb-3">Why join their Circle?</h3>
              <p><UsersRound className="inline h-5 w-5 mr-2 text-accent" />Joining a Circle means you can team up with friends, combine your scores, and compete for weekly glory.</p>
            </div>
            <p className="text-lg font-medium text-foreground">
              To get started and accept your Circle invitation:<br />
              Please Log In to your existing account.<br />
              Or, if you're new, Create a Free Account – it's quick and easy!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" className="w-full sm:w-auto font-semibold text-lg" asChild>
                <Link href={`/auth/login?inviteCode=${inviteCodeFromUrl}`}>
                  <LogIn className="mr-2 h-5 w-5" /> Log In to Join
                </Link>
              </Button>
              <Button size="lg" variant="secondary" className="w-full sm:w-auto font-semibold text-lg" asChild>
                <Link href={`/auth/register?inviteCode=${inviteCodeFromUrl}`}>
                  <UserPlus className="mr-2 h-5 w-5" /> Sign Up & Team Up!
                </Link>
              </Button>
            </div>
            {inviteCodeFromUrl && (
              <div className="mt-6 p-4 bg-accent/10 border border-accent/30 rounded-lg">
                <Info className="inline h-5 w-5 mr-2 text-accent mb-1" />
                <p className="text-sm text-accent-foreground">
                  It looks like you were trying to join a specific Circle using an invite! Once you've signed up or logged in, if you're not automatically taken to the Circle, you can use the invite code: <strong className="font-mono bg-muted px-1 rounded">{inviteCodeFromUrl}</strong> or simply try your original invite link again. We'll make sure you get to the right place!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!userProfile && !isLoadingAuth) { 
     return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Profile Loading Error</h2>
        <p className="text-muted-foreground mb-4">Could not load your user profile. Please try refreshing or logging in again.</p>
         <Button onClick={() => router.push('/auth/login')} >Go to Login</Button>
      </div>
    );
  }
  
  return (
    <div className="max-w-md w-full">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <LogIn className="mr-3 h-8 w-8 text-primary" /> Join a Circle
          </CardTitle>
          <CardDescription>
            Enter an invite code to join an existing LexiVerse circle.
            {inviteCodeFromUrl && <span className="block mt-1">Code <strong className="text-primary">{inviteCodeFromUrl}</strong> pre-filled from link.</span>}
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
            <FormField
              control={form.control}
              name="inviteCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invite Code</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter invite code" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-5 w-5" />
              )}
              Join Circle
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}

export default function JoinCirclePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-8 px-4">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center h-full">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Loading join form...</p>
        </div>
      }>
        <JoinCircleFormContent />
      </Suspense>
    </div>
  );
}
