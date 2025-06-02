
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from '@/components/ui/date-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit2, Trash2, Sparkles, Save, Loader2 } from 'lucide-react';
import type { DailyPuzzle, AdminPuzzleFormState, PuzzleSuggestion as ClientPuzzleSuggestion, GeneratePuzzleSuggestionsOutput } from '@/types'; // Renamed PuzzleSuggestion to ClientPuzzleSuggestion
import { generatePuzzleSuggestions } from '@/ai/flows/generate-puzzle-suggestions';
import { format } from 'date-fns';
import { firestore } from '@/lib/firebase';
import { doc, setDoc, getDoc, Timestamp, collection, getDocs } from 'firebase/firestore';

// Mock data for listing, updating, deleting - Replace with actual API calls for these too eventually
let MOCK_PUZZLES: DailyPuzzle[] = [
  { id: '2025-07-01', puzzleDateGMT: new Date('2025-07-01T00:00:00Z'), wordOfTheDayText: 'EXAMPLE', wordOfTheDayPoints: 50, seedingLetters: 'AEILMPRXE', status: 'Upcoming' },
  { id: '2025-07-02', puzzleDateGMT: new Date('2025-07-02T00:00:00Z'), wordOfTheDayText: 'ANOTHER', wordOfTheDayPoints: 60, seedingLetters: 'NOHRETABX', status: 'Active' },
];

async function mockFetchPuzzles(): Promise<DailyPuzzle[]> {
  // In a real app, you'd fetch from Firestore and convert Timestamps to Dates
  // For now, we add any newly created (real) puzzles to the mock list if they aren't there
  const puzzlesCollection = collection(firestore, "DailyPuzzles");
  const querySnapshot = await getDocs(puzzlesCollection);
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

  const allPuzzlesMap = new Map<string, DailyPuzzle>();
  [...MOCK_PUZZLES, ...firestorePuzzles].forEach(p => allPuzzlesMap.set(p.id, p));
  const mergedPuzzles = Array.from(allPuzzlesMap.values());
  mergedPuzzles.sort((a,b) => a.puzzleDateGMT.getTime() - b.puzzleDateGMT.getTime());
  
  return new Promise(resolve => setTimeout(() => resolve(mergedPuzzles), 500));
}


async function createDailyPuzzleInFirestore(puzzleData: AdminPuzzleFormState): Promise<DailyPuzzle> {
  if (!puzzleData.puzzleDateGMT) {
    throw new Error("Puzzle date is required.");
  }
  const docId = format(puzzleData.puzzleDateGMT, 'yyyy-MM-dd');
  const puzzleDocRef = doc(firestore, "DailyPuzzles", docId);

  const docSnap = await getDoc(puzzleDocRef);
  if (docSnap.exists()) {
    throw new Error(`A puzzle already exists for ${docId}. Please edit the existing one or choose a different date.`);
  }

  const newPuzzleForFirestore = {
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


async function mockUpdateDailyPuzzle(id: string, puzzleData: AdminPuzzleFormState): Promise<DailyPuzzle> {
  console.log('Mock updating puzzle:', id, puzzleData);
  const index = MOCK_PUZZLES.findIndex(p => p.id === id);
  if (index === -1) throw new Error("Puzzle not found");
  if (!puzzleData.puzzleDateGMT) throw new Error("Date is required");

  const updatedPuzzle: DailyPuzzle = {
    ...MOCK_PUZZLES[index],
    ...puzzleData,
    puzzleDateGMT: puzzleData.puzzleDateGMT,
    status: puzzleData.status,
  };
  MOCK_PUZZLES[index] = updatedPuzzle;
  MOCK_PUZZLES.sort((a,b) => a.puzzleDateGMT.getTime() - b.puzzleDateGMT.getTime());
  return new Promise(resolve => setTimeout(() => resolve(updatedPuzzle), 300));
}

async function mockDeleteDailyPuzzle(id: string): Promise<void> {
  console.log('Mock deleting puzzle:', id);
  MOCK_PUZZLES = MOCK_PUZZLES.filter(p => p.id !== id);
  return new Promise(resolve => setTimeout(() => resolve(), 300));
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
  const [showForm, setShowForm] = useState(false);
  const [editingPuzzleId, setEditingPuzzleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AdminPuzzleFormState>(initialFormState);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AdminPuzzleFormState, string>>>({});
  const [formabilityError, setFormabilityError] = useState<string>('');

  // State for AI puzzle generation
  const [generationQuantity, setGenerationQuantity] = useState<number>(3);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [puzzleSuggestions, setPuzzleSuggestions] = useState<ClientPuzzleSuggestion[]>([]); // Use ClientPuzzleSuggestion
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());


  const fetchPuzzles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await mockFetchPuzzles(); 
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
    else if (formData.puzzleDateGMT.getTime() < new Date(new Date().setHours(0,0,0,0)).getTime() && !editingPuzzleId) {
      // errors.puzzleDateGMT = "Puzzle date cannot be in the past for new puzzles.";
    }
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

    try {
      if (editingPuzzleId) {
        await mockUpdateDailyPuzzle(editingPuzzleId, formData);
        toast({ title: "Puzzle Updated (Mock)", description: `Puzzle for ${format(formData.puzzleDateGMT!, 'PPP')} has been updated.` });
      } else {
        await createDailyPuzzleInFirestore(formData);
        toast({ title: "Puzzle Created in Firebase!", description: `New puzzle for ${format(formData.puzzleDateGMT!, 'PPP')} has been saved to Firestore.` });
      }
      setShowForm(false);
      setEditingPuzzleId(null);
      setFormData(initialFormState);
      fetchPuzzles(); 
    } catch (error: any) {
      toast({ title: "Error Saving Puzzle", description: error.message || "Could not save puzzle.", variant: "destructive" });
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
    const puzzleDate = puzzle.puzzleDateGMT instanceof Timestamp 
                       ? puzzle.puzzleDateGMT.toDate() 
                       : puzzle.puzzleDateGMT;

    setFormData({
      puzzleDateGMT: puzzleDate,
      wordOfTheDayText: puzzle.wordOfTheDayText,
      wordOfTheDayPoints: puzzle.wordOfTheDayPoints,
      seedingLetters: puzzle.seedingLetters,
      status: puzzle.status === 'Expired' ? 'Upcoming' : puzzle.status,
    });
    setFormErrors({});
    setFormabilityError('');
    setEditingPuzzleId(puzzle.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await mockDeleteDailyPuzzle(id);
      toast({ title: "Puzzle Deleted (Mock)", description: `Puzzle ${id} has been deleted.` });
      fetchPuzzles(); 
    } catch (error: any) {
      toast({ title: "Error Deleting Puzzle", description: error.message || "Could not delete puzzle.", variant: "destructive" });
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
          id: crypto.randomUUID() // Add client-side ID for selection
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
    const puzzleDocRef = doc(firestore, "DailyPuzzles", docId);
    const newPuzzleForFirestore = {
      wordOfTheDayText: puzzleData.wordOfTheDayText.toUpperCase(),
      wordOfTheDayPoints: puzzleData.wordOfTheDayPoints,
      seedingLetters: puzzleData.seedingLetters.toUpperCase(),
      status: puzzleData.status,
      puzzleDateGMT: Timestamp.fromDate(puzzleData.puzzleDateGMT),
      // Note: The definition from AI suggestion is not directly saved to DailyPuzzle in this structure
      // It's used for admin review, but DailyPuzzle focuses on game play elements.
      // If you need to store the definition with the puzzle, add a field to DailyPuzzle.
    };
    await setDoc(puzzleDocRef, newPuzzleForFirestore);
    return { id: docId, ...puzzleData };
  }

  const handleSaveSelectedPuzzles = async () => {
    if (selectedSuggestionIds.size === 0) {
      toast({ title: "No Puzzles Selected", description: "Please select at least one puzzle suggestion to save.", variant: "default" });
      return;
    }
    setIsLoading(true); // Use general loading for this action
    const puzzlesToSave = puzzleSuggestions.filter(s => selectedSuggestionIds.has(s.id));
    const existingPuzzleDates = new Set<string>();
    
    try {
        const puzzlesCollectionRef = collection(firestore, "DailyPuzzles");
        const querySnapshot = await getDocs(puzzlesCollectionRef);
        querySnapshot.forEach((docSnap) => existingPuzzleDates.add(docSnap.id)); // doc.id is 'yyyy-MM-dd'
         // Also add dates from MOCK_PUZZLES to avoid conflict if they are not yet in Firestore
        MOCK_PUZZLES.forEach(p => existingPuzzleDates.add(format(p.puzzleDateGMT, 'yyyy-MM-dd')));

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
      let attempts = 0; // Safety for finding a date
      while (!assignedDate && attempts < 365 * 2) { // Try for 2 years
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
            // If saving fails for one, we still mark assignedDate as true to move to the next suggestion or date,
            // rather than getting stuck on this suggestion with a persistently failing save.
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
      toast({ title: "Puzzles Saved", description: `${savedCount} puzzles have been scheduled.` });
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
            Create, edit, and manage daily puzzles, including Word of the Day and seeding letters.
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
                      editingPuzzleId ? false : puzzles.some(p => 
                        p.puzzleDateGMT instanceof Timestamp 
                        ? format(p.puzzleDateGMT.toDate(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                        : format(p.puzzleDateGMT, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                      )
                    }
                  />
                  {formErrors.puzzleDateGMT && <p className="text-sm text-destructive mt-1">{formErrors.puzzleDateGMT}</p>}
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
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingPuzzleId(null); }}>Cancel</Button>
              <Button type="submit" disabled={!!formabilityError}>
                {editingPuzzleId ? 'Update Puzzle (Mock)' : 'Create Puzzle'}
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
            Selected puzzles will be scheduled for the next available future dates.
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
            <Button onClick={handleGenerateSuggestions} disabled={isGeneratingSuggestions}>
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
              <Button onClick={handleSaveSelectedPuzzles} disabled={selectedSuggestionIds.size === 0 || isLoading} className="w-full mt-4">
                {isLoading && selectedSuggestionIds.size > 0 ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : ( <Save className="mr-2 h-4 w-4" />) } 
                Save Selected ({selectedSuggestionIds.size}) to Firebase
              </Button>
            </div>
          )}
          {puzzleSuggestions.length === 0 && !isGeneratingSuggestions && generationQuantity > 0 && (
             <p className="text-sm text-muted-foreground text-center py-2">
              No suggestions generated, or all were filtered out. Try again, check AI flow logs, or ensure WordsAPI key is correctly configured if definitions are required.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Puzzle List</CardTitle>
          <CardDescription>View and manage all upcoming, active, and past puzzles. (List includes newly created puzzles from Firebase and mock data)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !isGeneratingSuggestions && puzzles.length === 0 ? ( 
            <p>Loading puzzles...</p>
          ) : puzzles.length === 0 && !isGeneratingSuggestions ? (
            <p className="text-muted-foreground">No puzzles found. Click "Add New Puzzle" or "Generate Suggestions".</p>
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
                {puzzles.map((puzzle) => {
                  const displayDate = puzzle.puzzleDateGMT instanceof Timestamp 
                                    ? puzzle.puzzleDateGMT.toDate() 
                                    : puzzle.puzzleDateGMT;
                  return (
                    <TableRow key={puzzle.id}>
                      <TableCell>{format(displayDate, 'yyyy-MM-dd')}</TableCell>
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
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditForm(puzzle)} title="Edit">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Delete" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the puzzle for {format(displayDate, 'PPP')}.
                                Deleting active or past puzzles can affect game data and user experience. (Currently uses mock delete)
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(puzzle.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                Yes, delete puzzle (Mock)
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
       <p className="text-xs text-muted-foreground text-center">
            Reminder: Puzzle creation now saves to Firestore. AI generated puzzles are also saved to Firestore.
            Fetching, updating, and deleting puzzles still use MOCK (client-side) functions for demonstration.
            Implement and connect to actual Firebase Cloud Functions for full persistence and server-side validation.
          </p>
    </div>
  );
}
