
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MailQuestion, ArrowLeft } from 'lucide-react';

const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
});

type ForgotPasswordFormValues = z.infer<typeof formSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, values.email);
      setEmailSent(true);
      toast({
        title: "Password Reset Email Sent",
        description: "If an account exists for this email, a link to reset your password has been sent. Please check your inbox (and spam folder).",
      });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      // Firebase often doesn't throw specific errors for sendPasswordResetEmail for security reasons (to prevent email enumeration)
      // So we show a generic success message regardless, but still log the error for debugging.
      // However, some client-side validation errors (like malformed email) might still be caught by Firebase client SDK.
       let errorMessage = "An error occurred. Please try again later.";
       if (error.code === 'auth/invalid-email') {
            errorMessage = "The email address format is invalid.";
            form.setError("email", { type: "manual", message: errorMessage });
       } else if (error.code === 'auth/user-not-found') {
          // Even if Firebase returns this, we show a generic message to the user.
          // We've already set emailSent to true and will show the success toast.
       }


      // If it wasn't a user-not-found error (which we handle by just showing success toast)
      // or an invalid email (handled by form error), then show a generic error toast.
      if (error.code !== 'auth/user-not-found' && error.code !== 'auth/invalid-email') {
        toast({
            title: "Request Failed",
            description: errorMessage,
            variant: "destructive",
        });
      } else if (error.code === 'auth/user-not-found') {
         // For user-not-found, we still set emailSent to true to avoid enumeration
         setEmailSent(true);
         toast({
            title: "Password Reset Email Sent",
            description: "If an account exists for this email, a link to reset your password has been sent. Please check your inbox (and spam folder).",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen py-12 bg-gradient-to-br from-background to-secondary/30">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary rounded-full p-3 w-fit mb-4">
            <MailQuestion className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-headline">Forgot Your Password?</CardTitle>
          <CardDescription>
            {emailSent 
              ? "Check your email (and spam folder) for the reset link."
              : "Enter your email address and we'll send you a link to reset your password."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailSent ? (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                If you don't receive an email within a few minutes, please ensure you entered the correct email address or try again later.
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                </Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full font-semibold text-lg py-3" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>
            </Form>
          )}
          {!emailSent && (
            <p className="mt-6 text-center text-sm">
              <Button variant="link" className="p-0 h-auto font-semibold" onClick={() => router.push('/auth/login')}>
                Remembered your password? Log In
              </Button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
