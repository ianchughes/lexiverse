
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Loader2, LogIn, UserPlus, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const joinCircleFormSchema = z.object({
  inviteCode: z.string().min(6, { message: "Invite code must be at least 6 characters." }).max(20, { message: "Invite code seems too long." }),
});

type JoinCircleFormValues = z.infer<typeof joinCircleFormSchema>;

export default function JoinCirclePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<JoinCircleFormValues>({
    resolver: zodResolver(joinCircleFormSchema),
    defaultValues: {
      inviteCode: "",
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

  if (!currentUser) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">You need to be logged in to join a circle.</p>
        <Button asChild>
          <Link href="/auth/login">Login</Link>
        </Button>
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
