
'use server';
/**
 * @fileOverview Generates daily puzzle suggestions (Word of the Day, Seeding Letters, and WotD Definition).
 *
 * - generatePuzzleSuggestions - A function that generates a list of puzzle suggestions.
 * - GeneratePuzzleSuggestionsInput - The input type.
 * - GeneratePuzzleSuggestionsOutput - The output type (includes WotD definition).
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { firestore } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { DailyPuzzle } from '@/types';

const PuzzleSuggestionSchema = z.object({
  wordOfTheDayText: z.string().regex(/^[A-Z]{6,9}$/, "Word of the Day must be 6-9 uppercase English letters.").describe('A potential Word of the Day, 6-9 English letters.'),
  seedingLetters: z.string().length(9).regex(/^[A-Z]{9}$/, "Seeding letters must be exactly 9 uppercase English letters.").describe('A string of 9 English letters from which the Word of the Day can be formed.'),
  wordOfTheDayDefinition: z.string().min(1, "Definition must not be empty.").describe('The definition of the Word of the Day from WordsAPI.'),
});

const GeneratePuzzleSuggestionsInputSchema = z.object({
  quantity: z.number().int().min(1).max(100).describe('The number of puzzle suggestions to generate (1-100).'),
});
export type GeneratePuzzleSuggestionsInput = z.infer<typeof GeneratePuzzleSuggestionsInputSchema>;

const GeneratePuzzleSuggestionsOutputSchema = z.object({
  suggestions: z.array(PuzzleSuggestionSchema).describe('An array of generated puzzle suggestions, each including a WotD definition.'),
});
export type GeneratePuzzleSuggestionsOutput = z.infer<typeof GeneratePuzzleSuggestionsOutputSchema>;

const PuzzleSuggestionSchemaRelaxedInternal = z.object({
  wordOfTheDayText: z.string().describe('A potential Word of the Day, 6-9 English letters.'),
  seedingLetters: z.string().describe('A string of English letters, AIMING for 9, from which the Word of the Day can be formed.'),
});

const GeneratePuzzleSuggestionsOutputSchemaRelaxedInternal = z.object({
  suggestions: z.array(PuzzleSuggestionSchemaRelaxedInternal).describe('An array of generated puzzle suggestions from the LLM.'),
});


export async function generatePuzzleSuggestions(input: GeneratePuzzleSuggestionsInput): Promise<GeneratePuzzleSuggestionsOutput> {
  return generatePuzzleSuggestionsFlow(input);
}

const puzzleGenerationPrompt = ai.definePrompt({
  name: 'puzzleGenerationPrompt',
  input: { schema: GeneratePuzzleSuggestionsInputSchema },
  output: { schema: GeneratePuzzleSuggestionsOutputSchemaRelaxedInternal },
  prompt: `You are tasked with generating {{quantity}} daily word puzzle suggestions for a game like LexiVerse.
Each suggestion needs a "Word of the Day" (WotD) and "Seeding Letters".

Constraints for each suggestion:
1.  **Word of the Day (wordOfTheDayText)**:
    *   Must be a common English word.
    *   Must be between 6 and 9 letters long (inclusive).
    *   Must contain only uppercase English letters.
    *   **Critically, try to ensure the 'Word of the Day' you generate is not a common word that might have already been used for a previous puzzle. Aim for fresh, interesting words.**
2.  **Seeding Letters (seedingLetters)**:
    *   Must be a string of EXACTLY 9 uppercase English letters. Double-check this length constraint.
    *   The Word of the Day *must* be formable using only the letters provided in Seeding Letters, respecting letter frequencies. For example, if WotD is "APPLE" and Seeding Letters is "APLEXYZQS", this is invalid because "APPLE" needs two 'P's but Seeding Letters only has one. If Seeding Letters is "APLEXPYZS", this is valid.
    *   The 9 seeding letters should be a good mix, containing the WotD letters plus a set of *randomized distractor letters* to make the puzzle challenging but fair. The overall set of 9 letters should appear randomized.

Generate exactly {{quantity}} such suggestions. Ensure each generated WotD is indeed formable from its corresponding Seeding Letters.
Return the output in the specified JSON format.
Example of one suggestion (without definition, which will be fetched later):
{
  "wordOfTheDayText": "EXAMPLE",
  "seedingLetters": "AXEMLPEXR"
}
(Note: "EXAMPLE" can be formed from "AXEMLPEXR")
`,
});


const generatePuzzleSuggestionsFlow = ai.defineFlow(
  {
    name: 'generatePuzzleSuggestionsFlow',
    inputSchema: GeneratePuzzleSuggestionsInputSchema,
    outputSchema: GeneratePuzzleSuggestionsOutputSchema,
  },
  async (input) => {
    let rawOutputFromPrompt: z.infer<typeof GeneratePuzzleSuggestionsOutputSchemaRelaxedInternal> | null | undefined;
    try {
      const { output } = await puzzleGenerationPrompt(input);
      rawOutputFromPrompt = output;
    } catch (flowError: any) {
      console.error(`[generatePuzzleSuggestionsFlow] Error executing puzzleGenerationPrompt: ${flowError.message}`, flowError);
      // Depending on how critical this is, you might re-throw or return empty.
      // For now, we'll return empty as the downstream logic expects 'suggestions' to be potentially empty.
      return { suggestions: [] };
    }

    if (!rawOutputFromPrompt || !rawOutputFromPrompt.suggestions) {
      console.warn('[generatePuzzleSuggestionsFlow] AI failed to generate puzzle suggestions or returned an empty/malformed suggestions list.');
      return { suggestions: [] };
    }

    const existingPuzzlesSnap = await getDocs(collection(firestore, 'DailyPuzzles'));
    const existingWotDs = new Set<string>();
    existingPuzzlesSnap.forEach(doc => {
      const puzzle = doc.data() as Partial<DailyPuzzle>;
      if (puzzle.wordOfTheDayText) {
        existingWotDs.add(puzzle.wordOfTheDayText.toUpperCase());
      }
    });

    const strictlyValidSuggestionsWithDefinitions: z.infer<typeof PuzzleSuggestionSchema>[] = [];
    const apiKey = process.env.NEXT_PUBLIC_WORDSAPI_KEY;

    if (!apiKey || apiKey === "YOUR_WORDSAPI_KEY_PLACEHOLDER" || apiKey.length < 10) {
      console.warn("[generatePuzzleSuggestionsFlow] WordsAPI key not configured or is placeholder. Cannot fetch definitions. No suggestions will be returned.");
      return { suggestions: [] };
    }

    for (const rawSuggestion of rawOutputFromPrompt.suggestions) {
      const wordOfTheDayText = rawSuggestion.wordOfTheDayText.toUpperCase().trim();
      const seedingLetters = rawSuggestion.seedingLetters.toUpperCase().trim();

      if (existingWotDs.has(wordOfTheDayText)) {
        console.warn(`[generatePuzzleSuggestionsFlow] AI suggested WotD '${wordOfTheDayText}' which already exists in DailyPuzzles. Filtering out.`);
        continue;
      }

      if (!/^[A-Z]{6,9}$/.test(wordOfTheDayText)) {
        console.warn(`[generatePuzzleSuggestionsFlow] AI returned WotD '${wordOfTheDayText}' with invalid format/length. Filtering out.`);
        continue;
      }
      if (!/^[A-Z]{9}$/.test(seedingLetters)) {
        console.warn(`[generatePuzzleSuggestionsFlow] AI returned Seeding Letters '${seedingLetters}' for WotD '${wordOfTheDayText}' with invalid format/length. Filtering out.`);
        continue;
      }
      
      const wotdChars = wordOfTheDayText.split('');
      const seedingMap = new Map<string, number>();
      for (const char of seedingLetters.split('')) {
          seedingMap.set(char, (seedingMap.get(char) || 0) + 1);
      }
      let formable = true;
      for (const char of wotdChars) {
          if (seedingMap.has(char) && seedingMap.get(char)! > 0) {
              seedingMap.set(char, seedingMap.get(char)! - 1);
          } else {
              formable = false;
              break;
          }
      }
      if (!formable) {
          console.warn(`[generatePuzzleSuggestionsFlow] AI returned WotD '${wordOfTheDayText}' which is not formable from Seeding Letters '${seedingLetters}'. Filtering out.`);
          continue;
      }
      
      let wordOfTheDayDefinition = "";
      try {
        const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${wordOfTheDayText.toLowerCase()}/definitions`, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.definitions && data.definitions.length > 0 && data.definitions[0].definition) {
            wordOfTheDayDefinition = data.definitions[0].definition;
          } else {
            console.warn(`[generatePuzzleSuggestionsFlow] WordsAPI: No definition found for WotD '${wordOfTheDayText}'. Filtering out.`);
            continue; 
          }
        } else {
          if (response.status === 404) {
            console.warn(`[generatePuzzleSuggestionsFlow] WordsAPI: Word '${wordOfTheDayText}' not found (404). Filtering out.`);
          } else {
            console.warn(`[generatePuzzleSuggestionsFlow] WordsAPI request for '${wordOfTheDayText}' failed with status ${response.status}. Filtering out.`);
          }
          continue; 
        }
      } catch (error: any) {
        console.error(`[generatePuzzleSuggestionsFlow] Error fetching definition for WotD '${wordOfTheDayText}' from WordsAPI: ${error.message}. Filtering out.`);
        continue; 
      }

      if (wordOfTheDayDefinition) {
        strictlyValidSuggestionsWithDefinitions.push({
          wordOfTheDayText,
          seedingLetters,
          wordOfTheDayDefinition,
        });
      }
    }
    
    if (strictlyValidSuggestionsWithDefinitions.length === 0 && rawOutputFromPrompt.suggestions.length > 0) {
        console.warn("[generatePuzzleSuggestionsFlow] All suggestions from AI were filtered out due to validation failures, being duplicates, or inability to fetch definitions after prompt execution.");
    }
    
    return { suggestions: strictlyValidSuggestionsWithDefinitions };
  }
);

