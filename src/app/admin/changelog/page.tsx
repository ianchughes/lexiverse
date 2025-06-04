
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { firestore } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { ChangelogEntry } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { adminCreateChangelogEntryAction, adminDeleteChangelogEntryAction } from './actions';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, History, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

const changelogFormSchema = z.object({
  version: z.string().min(1, "Version is required (e.g., 1.0.0)."),
  title: z.string().min(5, "Title must be at least 5 characters.").max(100, "Title cannot exceed 100 characters."),
  description: z.string().min(10, "Description must be at least 10 characters.").max(2000, "Description cannot exceed 2000 characters."),
});
type ChangelogFormValues = z.infer<typeof changelogFormSchema>;

const initialFormState: ChangelogFormValues = {
  version: '',
  title: '',
  description: '',
};

export default function ChangelogManagementPage() {
  const { toast } = useToast();
  const { currentUser: actingAdmin } = useAuth();
  const [changelogEntries, setChangelogEntries] = useState<ChangelogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  const [entryToDelete, setEntryToDelete] = useState<ChangelogEntry | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  const form = useForm<ChangelogFormValues>({
    resolver: zodResolver(changelogFormSchema),
    defaultValues: initialFormState,
  });

  const fetchChangelogEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = query(collection(firestore, "ChangelogEntries"), orderBy("datePublished", "desc"));
      const querySnapshot = await getDocs(q);
      const entries: ChangelogEntry[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChangelogEntry));
      setChangelogEntries(entries);
    } catch (error) {
      console.error("Error fetching changelog entries:", error);
      toast({ title: "Error", description: "Could not fetch changelog entries.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchChangelogEntries();
  }, [fetchChangelogEntries]);

  const handleFormSubmit = async (values: ChangelogFormValues) => {
    if (!actingAdmin) {
      toast({ title: "Authentication Error", description: "Admin not authenticated.", variant: "destructive" });
      return;
    }
    setIsSubmittingForm(true);
    try {
      const result = await adminCreateChangelogEntryAction({ ...values, actingAdminId: actingAdmin.uid });
      if (result.success) {
        toast({ title: "Changelog Entry Created", description: `Version ${values.version} has been published.` });
        form.reset(initialFormState);
        setShowCreateForm(false);
        fetchChangelogEntries();
      } else {
        throw new Error(result.error || "Failed to create entry.");
      }
    } catch (error: any) {
      toast({ title: "Error Creating Entry", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const openDeleteConfirm = (entry: ChangelogEntry) => {
    setEntryToDelete(entry);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!entryToDelete || !actingAdmin) return;
    setIsProcessingDelete(true);
    try {
      const result = await adminDeleteChangelogEntryAction({
        entryId: entryToDelete.id!,
        actingAdminId: actingAdmin.uid,
        entryVersion: entryToDelete.version,
      });
      if (result.success) {
        toast({ title: "Entry Deleted", description: `Changelog entry for version ${entryToDelete.version} deleted.` });
        fetchChangelogEntries();
      } else {
        throw new Error(result.error || "Failed to delete entry.");
      }
    } catch (error: any) {
      toast({ title: "Error Deleting Entry", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessingDelete(false);
      setIsDeleteConfirmOpen(false);
      setEntryToDelete(null);
    }
  };
  
  const formatDateSafe = (timestamp?: Timestamp) => {
    if (!timestamp) return 'N/A';
    return format(timestamp.toDate(), 'PP p');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-8 w-8 text-primary" /> Game Changelog Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Create, view, and manage game update announcements.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(prev => !prev)}>
          <PlusCircle className="mr-2 h-4 w-4" /> {showCreateForm ? 'Cancel' : 'Add New Entry'}
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Changelog Entry</CardTitle>
            <CardDescription>Publish an update about new features, changes, or fixes.</CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)}>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version (e.g., 1.0.1)</FormLabel>
                      <FormControl><Input placeholder="1.0.1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl><Input placeholder="Summary of update..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Changes)</FormLabel>
                      <FormControl><Textarea placeholder="Detail the changes made. Use bullet points or new lines for clarity." {...field} rows={6} /></FormControl>
                      <FormDescription>Max 2000 characters. Basic newlines will be preserved.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={isSubmittingForm}>
                  {isSubmittingForm && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publish Entry
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Published Changelog Entries</CardTitle>
            <CardDescription>List of all game updates.</CardDescription>
          </div>
          <Button onClick={fetchChangelogEntries} variant="outline" size="icon" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading entries...</p></div>
          ) : changelogEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No changelog entries found.</p>
          ) : (
            <ScrollArea className="h-[600px] pr-3">
              <div className="space-y-4">
                {changelogEntries.map(entry => (
                  <Card key={entry.id} className="shadow-sm">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl">Version {entry.version} - {entry.title}</CardTitle>
                          <CardDescription className="text-xs">
                            Published on: {formatDateSafe(entry.datePublished)} by Admin ID: {entry.publishedByAdminId.substring(0,6)}...
                          </CardDescription>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openDeleteConfirm(entry)} 
                          disabled={isProcessingDelete && entryToDelete?.id === entry.id}
                          className="text-destructive hover:text-destructive/80"
                        >
                          {isProcessingDelete && entryToDelete?.id === entry.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-line">{entry.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">Displaying {changelogEntries.length} changelog entries.</p>
        </CardFooter>
      </Card>
      
      {entryToDelete && (
        <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Delete Changelog Entry</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the changelog entry for version "{entryToDelete.version} - {entryToDelete.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProcessingDelete} onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete} disabled={isProcessingDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {isProcessingDelete ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
