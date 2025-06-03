
'use client';

import { Suspense, useState } from 'react';
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
import { Loader2, LogIn, UserPlus, AlertTriangle, Handshake, Info } from 'lucide-react';
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
  
  const inviteCodeFromUrl = searchParams.get('code');

  const form = useForm<JoinCircleFormValues>({
    resolver: zodResolver(joinCircleFormSchema),
    defaultValues: {
      inviteCode: inviteCodeFromUrl || "",
    },
  });

  async function onSubmit(values: JoinCircleFormValues) {
    if (!currentUser || !userProfile) {
      toast({ title: "Error", description: "You must be logged in to join a circle.", variant: "destructive" });
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
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  // This case should ideally be handled by the Page component directly,
  // but as a fallback within the form content:
  if (!currentUser) {
     return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-muted-foreground mb-4">Please log in or register to join a circle.</p>
        <div className="flex gap-4 justify-center">
          <Button asChild>
            <Link href="/auth/login">Login</Link>
          </Button>
           <Button asChild variant="outline">
            <Link href="/auth/register">Register</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <LogIn className="mr-3 h-8 w-8 text-primary" /> Join a Circle
          </CardTitle>
          <CardDescription>
            Enter an invite code to join an existing Lexiverse circle.
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
  const { currentUser, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen py-12 bg-gradient-to-br from-background to-secondary/20">
        <Card className="w-full max-w-lg shadow-2xl text-center">
          <CardHeader className="pt-8">
            <Handshake className="mx-auto h-16 w-16 text-primary mb-4" />
            <CardTitle className="text-3xl md:text-4xl font-headline text-primary">
              🤝 Team Up in LexiCircles! An Invite Awaits You!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 px-6 md:px-8 pb-8">
            <p className="text-muted-foreground text-lg leading-relaxed">
              Hello there! A friend has invited you to join their Circle in LexiCircles, the exciting daily word challenge!
            </p>
            
            <div className="text-left p-4 bg-muted/50 rounded-lg space-y-3">
              <h3 className="text-xl font-semibold text-foreground text-center mb-3">What's LexiCircles?</h3>
              <p><Info className="inline h-5 w-5 mr-2 text-accent" />Every day, you get 9 letters and 90 seconds to find as many words (4+ letters) as possible. Find the special "Word of the Day" to double your score! What makes it unique? You can discover and "own" words, earning points when others guess them later!</p>
              
              <h3 className="text-xl font-semibold text-foreground text-center mt-4 mb-3">Why Join Their Circle?</h3>
              <ul className="list-disc list-outside pl-5 space-y-1 marker:text-accent">
                <li>Combine your daily scores with friends.</li>
                <li>Compete together against other Circles.</li>
                <li>Share the fun of word discovery!</li>
              </ul>
            </div>

            <p className="text-lg font-medium text-foreground">
              Ready to jump in? <br/> You'll just need to log in or create a quick account to accept the invite and start playing.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" className="w-full sm:w-auto font-semibold text-lg" asChild>
                <Link href="/auth/login">
                  <LogIn className="mr-2 h-5 w-5" /> Log In
                </Link>
              </Button>
              <Button size="lg" variant="secondary" className="w-full sm:w-auto font-semibold text-lg" asChild>
                <Link href="/auth/register">
                  <UserPlus className="mr-2 h-5 w-5" /> Create Your Free Account
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If user is logged in, show the form to enter the code
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>}>
      <JoinCircleFormContent />
    </Suspense>
  );
}
