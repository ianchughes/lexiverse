
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

export const PuzzleSuggestionSchema = z.object({
  wordOfTheDayText: z.string().describe('A potential Word of the Day, 6-9 English letters.'),
  seedingLetters: z.string().length(9).describe('A string of 9 English letters from which the Word of the Day can be formed.'),
});
export type PuzzleSuggestion = z.infer<typeof PuzzleSuggestionSchema>;

export const GeneratePuzzleSuggestionsInputSchema = z.object({
  quantity: z.number().int().min(1).max(10).describe('The number of puzzle suggestions to generate.'),
});
export type GeneratePuzzleSuggestionsInput = z.infer<typeof GeneratePuzzleSuggestionsInputSchema>;

export const GeneratePuzzleSuggestionsOutputSchema = z.object({
  suggestions: z.array(PuzzleSuggestionSchema).describe('An array of generated puzzle suggestions.'),
});
export type GeneratePuzzleSuggestionsOutput = z.infer<typeof GeneratePuzzleSuggestionsOutputSchema>;

export async function generatePuzzleSuggestions(input: GeneratePuzzleSuggestionsInput): Promise<GeneratePuzzleSuggestionsOutput> {
  return generatePuzzleSuggestionsFlow(input);
}

const puzzleGenerationPrompt = ai.definePrompt({
  name: 'puzzleGenerationPrompt',
  input: { schema: GeneratePuzzleSuggestionsInputSchema },
  output: { schema: GeneratePuzzleSuggestionsOutputSchema },
  prompt: `You are tasked with generating {{quantity}} daily word puzzle suggestions for a game like Lexiverse.
Each suggestion needs a "Word of the Day" (WotD) and "Seeding Letters".

Constraints for each suggestion:
1.  **Word of the Day (wordOfTheDayText)**:
    *   Must be a common English word.
    *   Must be between 6 and 9 letters long (inclusive).
    *   Must contain only uppercase English letters.
2.  **Seeding Letters (seedingLetters)**:
    *   Must be a string of exactly 9 uppercase English letters.
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
    outputSchema: GeneratePuzzleSuggestionsOutputSchema,
  },
  async (input) => {
    const {output} = await puzzleGenerationPrompt(input);
    if (!output) {
      throw new Error('AI failed to generate puzzle suggestions.');
    }
    // Basic validation for seeding letters length can be done here if needed
    // A more robust formability check could also be added post-generation if desired,
    // but the prompt is quite specific.
    output.suggestions.forEach(suggestion => {
      if (suggestion.seedingLetters.length !== 9) {
        console.warn(`AI returned suggestion for ${suggestion.wordOfTheDayText} with invalid seeding letters length: ${suggestion.seedingLetters}`);
        // This suggestion might be problematic, consider filtering or marking
      }
       if (!/^[A-Z]{6,9}$/.test(suggestion.wordOfTheDayText)) {
         console.warn(`AI returned suggestion with invalid WotD: ${suggestion.wordOfTheDayText}`);
       }
       if (!/^[A-Z]{9}$/.test(suggestion.seedingLetters)) {
         console.warn(`AI returned suggestion with invalid seeding letters: ${suggestion.seedingLetters}`);
       }
    });

    return output;
  }
);
