
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from '@/components/ui/date-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit2, Trash2, Sparkles, Save, Loader2, RefreshCw } from 'lucide-react';
import type { DailyPuzzle, AdminPuzzleFormState, PuzzleSuggestion as ClientPuzzleSuggestion, GeneratePuzzleSuggestionsOutput } from '@/types';
import { generatePuzzleSuggestions } from '@/ai/flows/generate-puzzle-suggestions';
import { format } from 'date-fns';
import { firestore } from '@/lib/firebase';
import { doc, setDoc, getDoc, Timestamp, collection, getDocs, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';

const DAILY_PUZZLES_COLLECTION = "DailyPuzzles";

async function fetchPuzzlesFromFirestore(): Promise<DailyPuzzle[]> {
  const puzzlesCollectionRef = collection(firestore, DAILY_PUZZLES_COLLECTION);
  // Order by ID (which is YYYY-MM-DD date string) to get chronological order
  const q = query(puzzlesCollectionRef, orderBy("id")); 
  const querySnapshot = await getDocs(q);
  const firestorePuzzles: DailyPuzzle[] = [];
  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    firestorePuzzles.push({
      id: docSnap.id,
      puzzleDateGMT: (data.puzzleDateGMT as Timestamp).toDate(),
      wordOfTheDayText: data.wordOfTheDayText,
      wordOfTheDayPoints: data.wordOfTheDayPoints,
      seedingLetters: data.seedingLetters,
      status: data.status,
    });
  });
  // Already sorted by ID by Firestore query
  return firestorePuzzles;
}


async function createDailyPuzzleInFirestore(puzzleData: AdminPuzzleFormState): Promise<DailyPuzzle> {
  if (!puzzleData.puzzleDateGMT) {
    throw new Error("Puzzle date is required.");
  }
  const docId = format(puzzleData.puzzleDateGMT, 'yyyy-MM-dd');
  const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, docId);

  const docSnap = await getDoc(puzzleDocRef);
  if (docSnap.exists()) {
    throw new Error(`A puzzle already exists for ${docId}. Please edit the existing one or choose a different date.`);
  }

  const newPuzzleForFirestore = {
    id: docId, // Add id field explicitly
    wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
    wordOfTheDayPoints: puzzleData.wordOfTheDayPoints,
    seedingLetters: puzzleData.seedingLetters.toUpperCase(),
    status: puzzleData.status,
    puzzleDateGMT: Timestamp.fromDate(puzzleData.puzzleDateGMT), 
  };

  await setDoc(puzzleDocRef, newPuzzleForFirestore);

  return {
    id: docId,
    ...puzzleData, 
    puzzleDateGMT: puzzleData.puzzleDateGMT, 
    wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
    seedingLetters: puzzleData.seedingLetters.toUpperCase(),
  };
}

async function updateDailyPuzzleInFirestore(puzzleId: string, puzzleData: AdminPuzzleFormState): Promise<DailyPuzzle> {
  if (!puzzleData.puzzleDateGMT) { // Should not happen as date is disabled for edit
    throw new Error("Puzzle date is required for update.");
  }
  const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, puzzleId);
  const dataToUpdate = {
    wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
    wordOfTheDayPoints: puzzleData.wordOfTheDayPoints,
    seedingLetters: puzzleData.seedingLetters.toUpperCase(),
    status: puzzleData.status,
    // puzzleDateGMT: Timestamp.fromDate(puzzleData.puzzleDateGMT), // Date (ID) does not change for update
  };
  await updateDoc(puzzleDocRef, dataToUpdate);
  return { 
    id: puzzleId, 
    ...puzzleData, 
    puzzleDateGMT: puzzleData.puzzleDateGMT, // Keep as Date object client-side
    wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
    seedingLetters: puzzleData.seedingLetters.toUpperCase(),
  };
}

async function deleteDailyPuzzleFromFirestore(puzzleId: string): Promise<void> {
  const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, puzzleId);
  await deleteDoc(puzzleDocRef);
}


const initialFormState: AdminPuzzleFormState = {
  puzzleDateGMT: undefined,
  wordOfTheDayText: '',
  wordOfTheDayPoints: 0,
  seedingLetters: '',
  status: 'Upcoming',
};


export default function DailyPuzzleManagementPage() {
  const { toast } = useToast();
  const [puzzles, setPuzzles] = useState<DailyPuzzle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPuzzleId, setEditingPuzzleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AdminPuzzleFormState>(initialFormState);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AdminPuzzleFormState, string>>>({});
  const [formabilityError, setFormabilityError] = useState<string>('');

  // State for AI puzzle generation
  const [generationQuantity, setGenerationQuantity] = useState<number>(3);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [puzzleSuggestions, setPuzzleSuggestions] = useState<ClientPuzzleSuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());


  const fetchPuzzles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchPuzzlesFromFirestore(); 
      setPuzzles(data);
    } catch (error) {
      console.error("Error fetching puzzles:", error);
      toast({ title: "Error fetching puzzles", description: (error as Error).message || "Could not load puzzle data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPuzzles();
  }, [fetchPuzzles]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'wordOfTheDayPoints' ? parseInt(value,10) || 0 : value }));
    if (formErrors[name as keyof AdminPuzzleFormState]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }));
    }
     if (name === 'wordOfTheDayText' || name === 'seedingLetters') {
      setFormabilityError('');
    }
  };
  
  const handleStatusChange = (value: 'Upcoming' | 'Active') => {
    setFormData(prev => ({ ...prev, status: value }));
  };

  const handleDateChange = (date: Date | undefined) => {
    setFormData(prev => ({ ...prev, puzzleDateGMT: date }));
     if (formErrors.puzzleDateGMT) {
      setFormErrors(prev => ({ ...prev, puzzleDateGMT: undefined }));
    }
  };
  
  const countLetters = (str: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const char of str.toUpperCase()) {
      counts[char] = (counts[char] || 0) + 1;
    }
    return counts;
  };

  const checkFormability = useCallback(() => {
    const { wordOfTheDayText, seedingLetters } = formData;
    if (!wordOfTheDayText || !seedingLetters || seedingLetters.length !== 9) {
      setFormabilityError('');
      return true; 
    }

    const wotdCounts = countLetters(wordOfTheDayText);
    const seedingCounts = countLetters(seedingLetters);

    for (const char in wotdCounts) {
      if (!seedingCounts[char] || wotdCounts[char] > seedingCounts[char]) {
        setFormabilityError(`Word "${wordOfTheDayText.toUpperCase()}" cannot be formed. Not enough '${char}'.`);
        return false;
      }
    }
    setFormabilityError('');
    return true;
  }, [formData]);

  useEffect(() => {
    checkFormability();
  }, [formData.wordOfTheDayText, formData.seedingLetters, checkFormability]);


  const validateForm = () => {
    const errors: Partial<Record<keyof AdminPuzzleFormState, string>> = {};
    if (!formData.puzzleDateGMT) errors.puzzleDateGMT = "Puzzle date is required.";
    // Past date check is tricky with timezones, rely on Firestore rules or more robust server validation if critical.
    // Client-side check can be a UX enhancement.
    // else if (formData.puzzleDateGMT.getTime() < new Date(new Date().setHours(0,0,0,0)).getTime() && !editingPuzzleId) {
    //   errors.puzzleDateGMT = "Puzzle date cannot be in the past for new puzzles.";
    // }
    if (!formData.wordOfTheDayText.trim()) errors.wordOfTheDayText = "Word of the Day is required.";
    else if (formData.wordOfTheDayText.length < 6 || formData.wordOfTheDayText.length > 9) {
      errors.wordOfTheDayText = "Word of the Day must be 6-9 characters.";
    } else if (!/^[A-Z]+$/i.test(formData.wordOfTheDayText)) {
       errors.wordOfTheDayText = "Word of the Day must contain only English letters.";
    }
    if (formData.wordOfTheDayPoints <= 0) errors.wordOfTheDayPoints = "Points must be greater than 0.";
    if (!formData.seedingLetters.trim()) errors.seedingLetters = "Seeding letters are required.";
    else if (formData.seedingLetters.length !== 9) errors.seedingLetters = "Exactly 9 seeding letters are required.";
     else if (!/^[A-Z]+$/i.test(formData.seedingLetters)) {
       errors.seedingLetters = "Seeding letters must contain only English letters.";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!checkFormability()) return;

    setIsSubmittingForm(true);
    try {
      if (editingPuzzleId) {
        await updateDailyPuzzleInFirestore(editingPuzzleId, formData);
        toast({ title: "Puzzle Updated", description: `Puzzle for ${editingPuzzleId} has been updated in Firestore.` });
      } else {
        await createDailyPuzzleInFirestore(formData);
        toast({ title: "Puzzle Created", description: `New puzzle for ${format(formData.puzzleDateGMT!, 'PPP')} has been saved to Firestore.` });
      }
      setShowForm(false);
      setEditingPuzzleId(null);
      setFormData(initialFormState);
      fetchPuzzles(); 
    } catch (error: any) {
      toast({ title: "Error Saving Puzzle", description: error.message || "Could not save puzzle to Firestore.", variant: "destructive" });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const openCreateForm = () => {
    setFormData(initialFormState);
    setFormErrors({});
    setFormabilityError('');
    setEditingPuzzleId(null);
    setShowForm(true);
  };

  const openEditForm = (puzzle: DailyPuzzle) => {
    setFormData({
      puzzleDateGMT: puzzle.puzzleDateGMT, // Already a Date object from fetch
      wordOfTheDayText: puzzle.wordOfTheDayText,
      wordOfTheDayPoints: puzzle.wordOfTheDayPoints,
      seedingLetters: puzzle.seedingLetters,
      status: puzzle.status === 'Expired' ? 'Upcoming' : puzzle.status, // Don't allow editing to 'Expired'
    });
    setFormErrors({});
    setFormabilityError('');
    setEditingPuzzleId(puzzle.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string, puzzleDate: Date) => {
    setIsLoading(true); // Indicate general loading for delete action
    try {
      await deleteDailyPuzzleFromFirestore(id);
      toast({ title: "Puzzle Deleted", description: `Puzzle for ${format(puzzleDate, 'PPP')} has been deleted from Firestore.` });
      fetchPuzzles(); 
    } catch (error: any) {
      toast({ title: "Error Deleting Puzzle", description: error.message || "Could not delete puzzle from Firestore.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // AI Puzzle Generation Functions
  const handleGenerateSuggestions = async () => {
    if (generationQuantity < 1) {
      toast({ title: "Invalid Quantity", description: "Please enter a quantity of 1 or more.", variant: "destructive" });
      return;
    }
    setIsGeneratingSuggestions(true);
    setPuzzleSuggestions([]); 
    setSelectedSuggestionIds(new Set());

    try {
      const result: GeneratePuzzleSuggestionsOutput = await generatePuzzleSuggestions({ quantity: generationQuantity });
      if (result.suggestions && result.suggestions.length > 0) {
        setPuzzleSuggestions(result.suggestions.map(s => ({ 
          ...s, 
          id: crypto.randomUUID() 
        })));
        toast({ title: "Suggestions Generated", description: `${result.suggestions.length} puzzle suggestions have been generated with definitions.` });
      } else {
        toast({ title: "No Suggestions", description: "The AI didn't return any valid suggestions with definitions. Check WordsAPI key or AI flow logs.", variant: "default" });
      }
    } catch (error: any) {
      console.error("Error generating puzzle suggestions:", error);
      toast({ title: "Generation Failed", description: error.message || "Could not generate puzzle suggestions.", variant: "destructive" });
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const handleToggleSelectSuggestion = (suggestionId: string) => {
    setSelectedSuggestionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(suggestionId)) {
        newSet.delete(suggestionId);
      } else {
        newSet.add(suggestionId);
      }
      return newSet;
    });
  };
  
  async function saveSingleGeneratedPuzzleToFirestore(puzzleData: Omit<DailyPuzzle, 'id'>): Promise<DailyPuzzle> {
    const docId = format(puzzleData.puzzleDateGMT, 'yyyy-MM-dd');
    const puzzleDocRef = doc(firestore, DAILY_PUZZLES_COLLECTION, docId);
    const newPuzzleForFirestore = {
      id: docId,
      wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
      wordOfTheDayPoints: puzzleData.wordOfTheDayPoints,
      seedingLetters: puzzleData.seedingLetters.toUpperCase(),
      status: puzzleData.status,
      puzzleDateGMT: Timestamp.fromDate(puzzleData.puzzleDateGMT),
    };
    await setDoc(puzzleDocRef, newPuzzleForFirestore);
    return { id: docId, ...puzzleData };
  }

  const handleSaveSelectedPuzzles = async () => {
    if (selectedSuggestionIds.size === 0) {
      toast({ title: "No Puzzles Selected", description: "Please select at least one puzzle suggestion to save.", variant: "default" });
      return;
    }
    setIsLoading(true); 
    const puzzlesToSave = puzzleSuggestions.filter(s => selectedSuggestionIds.has(s.id));
    const existingPuzzleDates = new Set<string>();
    
    try {
        const puzzlesCollectionRef = collection(firestore, DAILY_PUZZLES_COLLECTION);
        const querySnapshot = await getDocs(puzzlesCollectionRef);
        querySnapshot.forEach((docSnap) => existingPuzzleDates.add(docSnap.id)); 

    } catch (error) {
        console.error("Error fetching existing puzzle dates:", error);
        toast({ title: "Error", description: "Could not verify existing puzzle dates. Aborting save.", variant: "destructive"});
        setIsLoading(false);
        return;
    }

    let currentDate = new Date();
    currentDate.setUTCHours(0, 0, 0, 0); 
    currentDate.setUTCDate(currentDate.getUTCDate() + 1); 

    let savedCount = 0;
    for (const suggestion of puzzlesToSave) {
      let assignedDate = false;
      let attempts = 0; 
      while (!assignedDate && attempts < 365 * 2) { 
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        if (!existingPuzzleDates.has(dateStr)) {
          const newPuzzleData: Omit<DailyPuzzle, 'id'> = {
            puzzleDateGMT: new Date(currentDate.getTime()), 
            wordOfTheDayText: suggestion.wordOfTheDayText,
            wordOfTheDayPoints: suggestion.wordOfTheDayText.length * 10, 
            seedingLetters: suggestion.seedingLetters,
            status: 'Upcoming',
          };
          try {
            await saveSingleGeneratedPuzzleToFirestore(newPuzzleData);
            existingPuzzleDates.add(dateStr); 
            savedCount++;
            assignedDate = true;
          } catch (error: any) {
            toast({ title: "Error Saving Puzzle", description: `Could not save ${suggestion.wordOfTheDayText} for ${dateStr}: ${error.message}`, variant: "destructive" });
            assignedDate = true; 
          }
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        attempts++;
      }
       if (!assignedDate) {
         toast({ title: "Date Assignment Error", description: `Could not find an available date for ${suggestion.wordOfTheDayText} within the next 2 years.`, variant: "destructive"});
       }
    }

    if (savedCount > 0) {
      toast({ title: "Puzzles Saved", description: `${savedCount} puzzles have been scheduled to Firestore.` });
      fetchPuzzles(); 
      setPuzzleSuggestions([]); 
      setSelectedSuggestionIds(new Set());
    } else if (puzzlesToSave.length > 0) {
        toast({ title: "No Puzzles Saved", description: "Could not save any selected puzzles. This might be due to date conflicts or other errors.", variant: "default"});
    }
    setIsLoading(false);
  };

  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Puzzle Management</h1>
          <p className="text-muted-foreground mt-1">
            Create, edit, and manage daily puzzles directly in Firestore.
          </p>
        </div>
        <Button onClick={openCreateForm}><PlusCircle className="mr-2 h-4 w-4" /> Add New Puzzle</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingPuzzleId ? 'Edit Puzzle' : 'Create New Puzzle'}</CardTitle>
            <CardDescription>
              {editingPuzzleId ? `Editing puzzle for ${format(formData.puzzleDateGMT || new Date(), 'PPP')}` : 'Define a new daily challenge for players.'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleFormSubmit}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="puzzleDateGMT">Puzzle Date (GMT)</Label>
                  <DatePicker 
                    date={formData.puzzleDateGMT} 
                    setDate={handleDateChange} 
                    disabled={(date) => 
                      editingPuzzleId ? true : // Disable date picker if editing
                      puzzles.some(p => 
                        format(p.puzzleDateGMT, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                      )
                    }
                  />
                  {formErrors.puzzleDateGMT && <p className="text-sm text-destructive mt-1">{formErrors.puzzleDateGMT}</p>}
                  {editingPuzzleId && <p className="text-xs text-muted-foreground mt-1">Date cannot be changed when editing an existing puzzle.</p>}
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={handleStatusChange}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Upcoming">Upcoming</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="wordOfTheDayText">Word of the Day (6-9 letters)</Label>
                <Input id="wordOfTheDayText" name="wordOfTheDayText" value={formData.wordOfTheDayText} onChange={handleInputChange} maxLength={9} />
                {formErrors.wordOfTheDayText && <p className="text-sm text-destructive mt-1">{formErrors.wordOfTheDayText}</p>}
              </div>
              <div>
                <Label htmlFor="wordOfTheDayPoints">Word of the Day Points</Label>
                <Input id="wordOfTheDayPoints" name="wordOfTheDayPoints" type="number" value={formData.wordOfTheDayPoints} onChange={handleInputChange} />
                {formErrors.wordOfTheDayPoints && <p className="text-sm text-destructive mt-1">{formErrors.wordOfTheDayPoints}</p>}
              </div>
              <div>
                <Label htmlFor="seedingLetters">Seeding Letters (Exactly 9 letters)</Label>
                <Input id="seedingLetters" name="seedingLetters" value={formData.seedingLetters} onChange={handleInputChange} maxLength={9} />
                {formErrors.seedingLetters && <p className="text-sm text-destructive mt-1">{formErrors.seedingLetters}</p>}
              </div>
              {formabilityError && <p className="text-sm text-destructive mt-1">{formabilityError}</p>}
               <p className="text-xs text-muted-foreground">
                 Note: WotD existence in Master Dictionary and point accuracy should be verified. Formability from seeding letters is checked client-side.
               </p>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingPuzzleId(null); }} disabled={isSubmittingForm}>Cancel</Button>
              <Button type="submit" disabled={!!formabilityError || isSubmittingForm}>
                {isSubmittingForm ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : (editingPuzzleId ? 'Update Puzzle' : 'Create Puzzle')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Generate Puzzle Suggestions (AI)</CardTitle>
          <CardDescription>
            Let AI generate new Word of the Day (with definitions from WordsAPI) and Seeding Letter combinations.
            Selected puzzles will be scheduled for the next available future dates in Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-grow">
              <Label htmlFor="generationQuantity">Number of Puzzles to Generate (1-10)</Label>
              <Input
                id="generationQuantity"
                type="number"
                value={generationQuantity}
                onChange={(e) => setGenerationQuantity(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                min="1"
                max="10"
                disabled={isGeneratingSuggestions}
                className="w-full"
              />
            </div>
            <Button onClick={handleGenerateSuggestions} disabled={isGeneratingSuggestions || isLoading}>
              {isGeneratingSuggestions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate
            </Button>
          </div>

          {isGeneratingSuggestions && <p className="text-muted-foreground text-center py-4"><Loader2 className="inline mr-2 h-4 w-4 animate-spin" />Generating suggestions with definitions...</p>}

          {puzzleSuggestions.length > 0 && !isGeneratingSuggestions && (
            <div className="space-y-3 mt-4">
              <h3 className="text-lg font-semibold">Generated Suggestions:</h3>
              <div className="max-h-96 overflow-y-auto space-y-2 border p-3 rounded-md bg-muted/20">
                {puzzleSuggestions.map((suggestion) => (
                  <Card key={suggestion.id} className={`p-3 transition-colors cursor-pointer hover:border-primary ${selectedSuggestionIds.has(suggestion.id) ? 'border-primary bg-secondary' : 'bg-background'}`} onClick={() => handleToggleSelectSuggestion(suggestion.id)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-grow pr-2">
                        <p className="font-semibold">WotD: <span className="font-mono text-primary">{suggestion.wordOfTheDayText}</span></p>
                        <p className="text-sm text-muted-foreground">Seeding: <span className="font-mono">{suggestion.seedingLetters}</span></p>
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={suggestion.wordOfTheDayDefinition}>Definition: {suggestion.wordOfTheDayDefinition}</p>
                      </div>
                      <Checkbox
                        checked={selectedSuggestionIds.has(suggestion.id)}
                        onCheckedChange={() => handleToggleSelectSuggestion(suggestion.id)}
                        id={`select-suggestion-${suggestion.id}`}
                        aria-label={`Select puzzle suggestion ${suggestion.wordOfTheDayText}`}
                        className="mt-1"
                      />
                    </div>
                  </Card>
                ))}
              </div>
              <Button onClick={handleSaveSelectedPuzzles} disabled={selectedSuggestionIds.size === 0 || isLoading || isGeneratingSuggestions} className="w-full mt-4">
                {isLoading && selectedSuggestionIds.size > 0 ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : ( <Save className="mr-2 h-4 w-4" />) } 
                Save Selected ({selectedSuggestionIds.size}) to Firebase
              </Button>
            </div>
          )}
          {puzzleSuggestions.length === 0 && !isGeneratingSuggestions && generationQuantity > 0 && (
             <p className="text-sm text-muted-foreground text-center py-2">
              No suggestions generated, or all were filtered out. Try again, check AI flow logs, or ensure WordsAPI key is correctly configured.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <div>
            <CardTitle>Puzzle List</CardTitle>
            <CardDescription>View and manage all puzzles from Firestore.</CardDescription>
          </div>
           <Button onClick={fetchPuzzles} variant="outline" size="icon" disabled={isLoading || isGeneratingSuggestions}>
              <RefreshCw className={`h-4 w-4 ${isLoading && !isGeneratingSuggestions ? 'animate-spin' : ''}`} />
            </Button>
        </CardHeader>
        <CardContent>
          {isLoading && !isGeneratingSuggestions && puzzles.length === 0 ? ( 
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Loading puzzles from Firestore...</p>
            </div>
          ) : puzzles.length === 0 && !isGeneratingSuggestions ? (
            <p className="text-muted-foreground text-center py-10">No puzzles found in Firestore. Click "Add New Puzzle" or "Generate Suggestions".</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date (GMT)</TableHead>
                  <TableHead>Word of the Day</TableHead>
                  <TableHead>Seeding Letters</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {puzzles.map((puzzle) => (
                    <TableRow key={puzzle.id}>
                      <TableCell>{format(puzzle.puzzleDateGMT, 'yyyy-MM-dd')}</TableCell>
                      <TableCell>{puzzle.wordOfTheDayText}</TableCell>
                      <TableCell>{puzzle.seedingLetters}</TableCell>
                      <TableCell>{puzzle.wordOfTheDayPoints}</TableCell>
                      <TableCell>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                              puzzle.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100' :
                              puzzle.status === 'Upcoming' ? 'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100' :
                              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-100'
                          }`}>
                              {puzzle.status}
                          </span>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditForm(puzzle)} title="Edit" disabled={isLoading || isGeneratingSuggestions}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Delete" className="text-destructive hover:text-destructive" disabled={isLoading || isGeneratingSuggestions}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the puzzle for {format(puzzle.puzzleDateGMT, 'PPP')} from Firestore.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(puzzle.id, puzzle.puzzleDateGMT)} disabled={isLoading} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Yes, delete puzzle"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">
              Displaying {puzzles.length} puzzles from Firestore.
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
