
'use server';
/**
 * @fileOverview Generates daily puzzle suggestions (Word of the Day and Seeding Letters).
 *
 * - generatePuzzleSuggestions - A function that generates a list of puzzle suggestions.
 * - GeneratePuzzleSuggestionsInput - The input type.
 * - GeneratePuzzleSuggestionsOutput - The output type.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Strict schema for the flow's final output and for external types
const PuzzleSuggestionSchema = z.object({
  wordOfTheDayText: z.string().regex(/^[A-Z]{6,9}$/, "Word of the Day must be 6-9 uppercase English letters.").describe('A potential Word of the Day, 6-9 English letters.'),
  seedingLetters: z.string().length(9).regex(/^[A-Z]{9}$/, "Seeding letters must be exactly 9 uppercase English letters.").describe('A string of 9 English letters from which the Word of the Day can be formed.'),
});
export type PuzzleSuggestion = z.infer<typeof PuzzleSuggestionSchema>;

const GeneratePuzzleSuggestionsInputSchema = z.object({
  quantity: z.number().int().min(1).max(10).describe('The number of puzzle suggestions to generate.'),
});
export type GeneratePuzzleSuggestionsInput = z.infer<typeof GeneratePuzzleSuggestionsInputSchema>;

const GeneratePuzzleSuggestionsOutputSchema = z.object({
  suggestions: z.array(PuzzleSuggestionSchema).describe('An array of generated puzzle suggestions.'),
});
export type GeneratePuzzleSuggestionsOutput = z.infer<typeof GeneratePuzzleSuggestionsOutputSchema>;


// Relaxed internal schema for what the LLM prompt initially tries to produce
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
  output: { schema: GeneratePuzzleSuggestionsOutputSchemaRelaxedInternal }, // LLM uses relaxed schema
  prompt: `You are tasked with generating {{quantity}} daily word puzzle suggestions for a game like Lexiverse.
Each suggestion needs a "Word of the Day" (WotD) and "Seeding Letters".

Constraints for each suggestion:
1.  **Word of the Day (wordOfTheDayText)**:
    *   Must be a common English word.
    *   Must be between 6 and 9 letters long (inclusive).
    *   Must contain only uppercase English letters.
2.  **Seeding Letters (seedingLetters)**:
    *   Must be a string of EXACTLY 9 uppercase English letters. Double-check this length constraint.
    *   The Word of the Day *must* be formable using only the letters provided in Seeding Letters, respecting letter frequencies. For example, if WotD is "APPLE" and Seeding Letters is "APLEXYZQS", this is invalid because "APPLE" needs two 'P's but Seeding Letters only has one. If Seeding Letters is "APLEXPYZS", this is valid.
    *   The seeding letters should ideally contain the WotD letters plus some distractor letters to make the puzzle challenging but fair.

Generate exactly {{quantity}} such suggestions. Ensure each generated WotD is indeed formable from its corresponding Seeding Letters.
Return the output in the specified JSON format.
Example of one suggestion:
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
    outputSchema: GeneratePuzzleSuggestionsOutputSchema, // Flow's final output MUST be strict
  },
  async (input) => {
    const {output: rawOutputFromPrompt} = await puzzleGenerationPrompt(input); // Gets relaxed output

    if (!rawOutputFromPrompt || !rawOutputFromPrompt.suggestions) {
      throw new Error('AI failed to generate puzzle suggestions or returned an empty/malformed suggestions list.');
    }

    const strictlyValidSuggestions: PuzzleSuggestion[] = rawOutputFromPrompt.suggestions
      .map(suggestion => ({
        wordOfTheDayText: suggestion.wordOfTheDayText.toUpperCase().trim(),
        seedingLetters: suggestion.seedingLetters.toUpperCase().trim(),
      }))
      .filter(suggestion => {
        const isWotDValid = /^[A-Z]{6,9}$/.test(suggestion.wordOfTheDayText);
        const isSeedingLettersValid = /^[A-Z]{9}$/.test(suggestion.seedingLetters);

        if (!isWotDValid) {
          console.warn(`AI returned suggestion with invalid Word of the Day: '${suggestion.wordOfTheDayText}'. Filtering out.`);
          return false;
        }
        if (!isSeedingLettersValid) {
          console.warn(`AI returned suggestion for WotD '${suggestion.wordOfTheDayText}' with invalid Seeding Letters: '${suggestion.seedingLetters}' (length: ${suggestion.seedingLetters.length}). Filtering out.`);
          return false;
        }
        
        // Basic formability check (can be enhanced)
        const wotdChars = suggestion.wordOfTheDayText.split('');
        const seedingChars = suggestion.seedingLetters.split('');
        const seedingMap = new Map<string, number>();
        for (const char of seedingChars) {
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
            console.warn(`AI returned WotD '${suggestion.wordOfTheDayText}' which is not formable from Seeding Letters '${suggestion.seedingLetters}'. Filtering out.`);
            return false;
        }
        
        return true;
      });

    if (strictlyValidSuggestions.length === 0 && rawOutputFromPrompt.suggestions.length > 0) {
        console.warn("All suggestions from AI were filtered out due to validation failures after prompt execution.");
        // Consider throwing an error or returning a specific message if this happens often.
    }
    
    return { suggestions: strictlyValidSuggestions };
  }
);

