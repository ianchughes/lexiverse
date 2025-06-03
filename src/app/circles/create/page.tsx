
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { createCircleAction } from '@/app/circles/actions'; 

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const createCircleFormSchema = z.object({
  circleName: z.string().min(3, { message: "Circle name must be at least 3 characters." }).max(50, { message: "Circle name cannot exceed 50 characters." }),
  publicDescription: z.string().max(200, { message: "Description cannot exceed 200 characters." }).optional(),
  // publicTags: z.string().optional(), // For simplicity, deferring tags
  isPublic: z.boolean().default(false),
});

type CreateCircleFormValues = z.infer<typeof createCircleFormSchema>;

export default function CreateCirclePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, userProfile, isLoadingAuth } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateCircleFormValues>({
    resolver: zodResolver(createCircleFormSchema),
    defaultValues: {
      circleName: "",
      publicDescription: "",
      isPublic: false,
    },
  });

  async function onSubmit(values: CreateCircleFormValues) {
    if (!currentUser || !userProfile) {
      toast({ title: "Error", description: "You must be logged in to create a circle.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createCircleAction({
        circleName: values.circleName,
        isPublic: values.isPublic,
        publicDescription: values.publicDescription || "",
        // tags: values.publicTags ? values.publicTags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        creatorUserID: currentUser.uid,
        creatorUsername: userProfile.username,
      });

      if (result.success && result.circleId) {
        toast({
          title: "Circle Created!",
          description: `Your circle "${values.circleName}" has been successfully created.`,
        });
        router.push(`/circles/${result.circleId}`);
      } else {
        throw new Error(result.error || "Failed to create circle.");
      }
    } catch (error: any) {
      console.error("Create circle error:", error);
      toast({
        title: "Creation Failed",
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
        <p className="text-muted-foreground mb-4">You need to be logged in to create a circle.</p>
        <Button asChild>
          <Link href="/auth/login">Login</Link>
        </Button>
      </div>
    );
  }


  return (
    <div className="max-w-2xl mx-auto">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <PlusCircle className="mr-3 h-8 w-8 text-primary" /> Create a New Circle
          </CardTitle>
          <CardDescription>
            Build your LexiVerse team! Choose a name, set privacy, and start inviting members.
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
                      <Input placeholder="e.g., The Word Wizards" {...field} />
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
                      <Textarea placeholder="Describe your circle to potential public members." {...field} />
                    </FormControl>
                     <FormDescription>
                      This will be visible if you make your circle public. Max 200 characters.
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
                        Make Circle Public?
                      </FormLabel>
                      <FormDescription>
                        Public circles can be discovered by anyone. Private circles are invite-only.
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
              {/* Tags field deferred for simplicity 
              <FormField
                control={form.control}
                name="publicTags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Public Tags (Optional, comma-separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Casual, Competitive, Daily Players" {...field} />
                    </FormControl>
                    <FormDescription>
                      Helps others find your public circle.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              */}
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlusCircle className="mr-2 h-5 w-5" />
                )}
                Create Circle
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}

