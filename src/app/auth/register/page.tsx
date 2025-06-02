
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import type { CircleInvite } from '@/types';

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
];

const passwordValidation = z.string()
  .min(8, { message: "Password must be at least 8 characters long." })
  .regex(/[a-z]/, { message: "Password must contain at least one lowercase letter." })
  .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter." })
  .regex(/[0-9]/, { message: "Password must contain at least one number." })
  .regex(/[^a-zA-Z0-9]/, { message: "Password must contain at least one special character." });


const formSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters." }).max(20, { message: "Username cannot exceed 20 characters." }).regex(/^[a-zA-Z0-9_]+$/, { message: "Username can only contain letters, numbers, and underscores." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: passwordValidation,
  confirmPassword: z.string(),
  registrationCountry: z.string().min(1, { message: "Please select your country." }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

type RegistrationFormValues = z.infer<typeof formSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [inviteIdFromUrl, setInviteIdFromUrl] = useState<string | null>(null);

  useEffect(() => {
    const inviteId = searchParams.get('inviteId');
    if (inviteId) {
      setInviteIdFromUrl(inviteId);
    }
  }, [searchParams]);

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      registrationCountry: "",
    },
  });

  async function onSubmit(values: RegistrationFormValues) {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;

      if (user) {
        const userProfileData = {
          username: values.username,
          email: values.email,
          registrationCountry: values.registrationCountry,
          overallPersistentScore: 0,
          dateCreated: serverTimestamp(),
          accountStatus: 'Active',
          lastPlayedDate_GMT: null,
          wotdStreakCount: 0,
          uid: user.uid,
        };
        await setDoc(doc(firestore, "Users", user.uid), userProfileData);

        // Check for pending email invites
        const invitesQuery = query(
          collection(firestore, "CircleInvites"),
          where("inviteeEmail", "==", values.email.toLowerCase()), // Store and query emails consistently (e.g., lowercase)
          where("status", "==", "SentToEmail")
        );
        const invitesSnapshot = await getDocs(invitesQuery);
        
        if (!invitesSnapshot.empty) {
          const batch = writeBatch(firestore);
          invitesSnapshot.forEach(inviteDoc => {
            const inviteData = inviteDoc.data() as CircleInvite;
            // Link invite to the new user if inviteIdFromUrl matches, or if it's any pending email invite for this user.
            if (inviteIdFromUrl === inviteDoc.id || !inviteIdFromUrl) { // Prioritize URL inviteId if present
                 batch.update(doc(firestore, "CircleInvites", inviteDoc.id), {
                    inviteeUserId: user.uid,
                    status: "Sent" // Change status so it appears as a normal in-app notification
                });
                 toast({
                    title: "Circle Invite Updated",
                    description: `An existing circle invitation from "${inviteData.inviterUsername}" for "${inviteData.circleName}" has been linked to your new account. Check your notifications!`,
                    duration: 7000,
                });
            }
          });
          await batch.commit();
        }

        await sendEmailVerification(user);
        toast({
          title: "Account Created!",
          description: "Your Lexiverse account has been successfully created. A verification email has been sent.",
        });
        router.push('/');
      } else {
        throw new Error("User creation failed unexpectedly.");
      }

    } catch (error: any) {
      console.error("Registration error:", error);
      let errorMessage = "An unexpected error occurred. Please try again.";
      if (error.code) {
        switch (error.code) {
          case 'auth/email-already-in-use':
            errorMessage = "This email address is already registered. Please try logging in or use a different email.";
            form.setError("email", { type: "manual", message: errorMessage });
            break;
          case 'auth/weak-password':
            errorMessage = "Password is too weak. Please ensure it meets the requirements.";
             form.setError("password", { type: "manual", message: "Password is too weak. It must be at least 8 characters and include uppercase, lowercase, number, and special character." });
            break;
          case 'auth/invalid-email':
            errorMessage = "The email address format is invalid.";
            form.setError("email", { type: "manual", message: errorMessage });
            break;
          default:
            errorMessage = `Registration failed: ${error.message}`;
        }
      }
      toast({
        title: "Registration Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen py-12 bg-gradient-to-br from-background to-secondary/30">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary rounded-full p-3 w-fit mb-4">
            <UserPlus className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-headline">Create your Lexiverse Account</CardTitle>
          <CardDescription>Join the community and start your word adventure!</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="YourUniqueUsername" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPassword ? "text" : "password"} placeholder="••••••••" {...field} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                     <FormControl>
                      <div className="relative">
                        <Input type={showConfirmPassword ? "text" : "password"} placeholder="••••••••" {...field} />
                         <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="registrationCountry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full font-semibold text-lg py-3" disabled={isLoading}>
                {isLoading ? 'Creating Account...' : 'Sign Up'}
              </Button>
            </form>
          </Form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Button variant="link" className="p-0 h-auto font-semibold" onClick={() => router.push('/auth/login')}>
              Log In
            </Button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
