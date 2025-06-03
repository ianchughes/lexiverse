
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, AlertTriangle, UserCircle, Edit3, FileText, UploadCloud } from 'lucide-react';
import { format } from 'date-fns';
import { firestore, storage, auth } from '@/lib/firebase'; // Import storage and auth
import { collection, query, where, getDocs, Timestamp, doc, updateDoc } from 'firebase/firestore'; // Import doc, updateDoc
import type { MasterWordType } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Storage functions
import { updateProfile } from 'firebase/auth'; // Auth function
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';


// Helper function to get initials
const getInitials = (name?: string) => {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
};

const MASTER_WORDS_COLLECTION = "Words";

export default function ProfilePage() {
  const { currentUser, userProfile, isLoadingAuth, setUserProfile } = useAuth(); // Get setUserProfile from context
  const { toast } = useToast();
  const [ownedWords, setOwnedWords] = useState<MasterWordType[]>([]);
  const [isLoadingOwnedWords, setIsLoadingOwnedWords] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchOwnedWords = useCallback(async () => {
    if (!currentUser) {
      setIsLoadingOwnedWords(false);
      return;
    }
    setIsLoadingOwnedWords(true);
    try {
      const q = query(collection(firestore, MASTER_WORDS_COLLECTION), where("originalSubmitterUID", "==", currentUser.uid));
      const querySnapshot = await getDocs(q);
      const words: MasterWordType[] = [];
      querySnapshot.forEach((doc) => {
        words.push({ wordText: doc.id, ...doc.data() } as MasterWordType);
      });
      setOwnedWords(words.sort((a,b) => a.wordText.localeCompare(b.wordText)));
    } catch (error) {
      console.error("Error fetching owned words:", error);
      toast({ title: "Error", description: "Could not fetch your owned words.", variant: "destructive" });
    } finally {
      setIsLoadingOwnedWords(false);
    }
  }, [currentUser, toast]);

  useEffect(() => {
    if (!isLoadingAuth && currentUser) {
        fetchOwnedWords();
    }
  }, [isLoadingAuth, currentUser, fetchOwnedWords]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
          toast({ title: "File too large", description: "Please select an image smaller than 5MB.", variant: "destructive"});
          return;
      }
      setSelectedFile(file);
      // Automatically trigger upload once a file is selected
      handleUpload(file);
    }
  };

  const handleUpload = async (fileToUpload: File | null) => {
    if (!fileToUpload || !currentUser) {
      toast({ title: "Error", description: "No file selected or user not logged in.", variant: "destructive"});
      return;
    }
    setIsUploading(true);
    const filePath = `profile_images/${currentUser.uid}/${fileToUpload.name}`;
    const fileStorageRef = storageRef(storage, filePath);

    try {
      const uploadTask = uploadBytesResumable(fileStorageRef, fileToUpload);

      uploadTask.on('state_changed',
        (snapshot) => {
          // Optional: Handle progress
          // const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          // console.log('Upload is ' + progress + '% done');
        },
        (error) => {
          console.error("Upload failed:", error);
          toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // Update Firebase Auth user profile
          if (auth.currentUser) {
            await updateProfile(auth.currentUser, { photoURL: downloadURL });
          }

          // Update Firestore user profile document
          const userDocRef = doc(firestore, "Users", currentUser.uid);
          await updateDoc(userDocRef, { photoURL: downloadURL });

          // Update local userProfile state in context if setUserProfile is available
          if (setUserProfile && userProfile) {
             setUserProfile({ ...userProfile, photoURL: downloadURL });
          }


          toast({ title: "Profile Photo Updated!", description: "Your new photo is now active." });
          setSelectedFile(null); // Clear selected file
          setIsUploading(false);
        }
      );
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload Error", description: error.message, variant: "destructive" });
      setIsUploading(false);
    }
  };


  if (isLoadingAuth) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser || !userProfile) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">
          You need to be logged in to view your profile.
        </p>
        <Button asChild>
          <Link href="/auth/login">Login</Link>
        </Button>
      </div>
    );
  }
  
  // Use userProfile.photoURL for display, fallback to currentUser.photoURL if context is slower to update
  const displayPhotoURL = userProfile.photoURL || currentUser.photoURL || undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <div className="relative mx-auto mb-4">
            <Avatar className="h-24 w-24 ring-4 ring-primary ring-offset-2 ring-offset-background">
              <AvatarImage src={displayPhotoURL} alt={userProfile.username} />
              <AvatarFallback className="text-3xl">{getInitials(userProfile.username)}</AvatarFallback>
            </Avatar>
            <Button 
              variant="outline" 
              size="icon" 
              className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-background shadow-md"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title="Change profile photo"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
            </Button>
            <Input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              disabled={isUploading}
            />
          </div>
          <CardTitle className="text-3xl font-headline">{userProfile.username}</CardTitle>
          <CardDescription className="text-lg">{currentUser.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">Overall Score</p>
              <p className="text-xl text-foreground">{userProfile.overallPersistentScore}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">WotD Streak</p>
              <p className="text-xl text-foreground">{userProfile.wotdStreakCount || 0}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">Country</p>
              <p className="text-xl text-foreground">{userProfile.registrationCountry}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="font-semibold text-muted-foreground">Joined</p>
              <p className="text-xl text-foreground">
                {userProfile.dateCreated instanceof Timestamp 
                  ? format(userProfile.dateCreated.toDate(), 'PPP')
                  : 'N/A'}
              </p>
            </div>
             <div className="p-3 bg-muted/50 rounded-md md:col-span-2">
              <p className="font-semibold text-muted-foreground">Account Status</p>
              <p className="text-xl text-foreground">{userProfile.accountStatus}</p>
            </div>
          </div>
           {/* Remove the "Edit Profile (Coming Soon)" button, photo upload is the edit action for now */}
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-6 w-6 text-primary" />
            Words You Own ({ownedWords.length})
          </CardTitle>
          <CardDescription>
            Words you were the first to submit and are now part of Lexiverse!
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingOwnedWords ? (
            <div className="flex justify-center items-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading your words...</p>
            </div>
          ) : ownedWords.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              You haven't claimed any words yet. Find new words in the daily puzzle!
            </p>
          ) : (
            <ScrollArea className="h-60 border rounded-md">
              <ul className="p-4 space-y-2">
                {ownedWords.map((word) => (
                  <li key={word.wordText} className="p-2 bg-muted/30 rounded-md hover:bg-muted/60 transition-colors">
                    <p className="font-semibold text-foreground">{word.wordText}</p>
                    <p className="text-xs text-muted-foreground truncate" title={word.definition}>{word.definition}</p>
                    <p className="text-xs text-muted-foreground">
                        Added: {word.dateAdded instanceof Timestamp ? format(word.dateAdded.toDate(), 'PP') : 'N/A'}
                    </p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Profile photo updates are handled directly. More settings coming soon.
      </p>
    </div>
  );
}
