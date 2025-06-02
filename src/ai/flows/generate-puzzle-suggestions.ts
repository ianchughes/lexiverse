
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

// Strict schema for the flow's final output and for external types
const PuzzleSuggestionSchema = z.object({
  wordOfTheDayText: z.string().regex(/^[A-Z]{6,9}$/, "Word of the Day must be 6-9 uppercase English letters.").describe('A potential Word of the Day, 6-9 English letters.'),
  seedingLetters: z.string().length(9).regex(/^[A-Z]{9}$/, "Seeding letters must be exactly 9 uppercase English letters.").describe('A string of 9 English letters from which the Word of the Day can be formed.'),
  wordOfTheDayDefinition: z.string().min(1, "Definition must not be empty.").describe('The definition of the Word of the Day from WordsAPI.'),
});
// This type is implicitly created by Zod infer, but we export a more specific one from /src/types/index.ts

const GeneratePuzzleSuggestionsInputSchema = z.object({
  quantity: z.number().int().min(1).max(10).describe('The number of puzzle suggestions to generate.'),
});
export type GeneratePuzzleSuggestionsInput = z.infer<typeof GeneratePuzzleSuggestionsInputSchema>;

const GeneratePuzzleSuggestionsOutputSchema = z.object({
  suggestions: z.array(PuzzleSuggestionSchema).describe('An array of generated puzzle suggestions, each including a WotD definition.'),
});
export type GeneratePuzzleSuggestionsOutput = z.infer<typeof GeneratePuzzleSuggestionsOutputSchema>;


// Relaxed internal schema for what the LLM prompt initially tries to produce (definition is fetched later)
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
    outputSchema: GeneratePuzzleSuggestionsOutputSchema, // Flow's final output MUST be strict (including definition)
  },
  async (input) => {
    const {output: rawOutputFromPrompt} = await puzzleGenerationPrompt(input); 

    if (!rawOutputFromPrompt || !rawOutputFromPrompt.suggestions) {
      throw new Error('AI failed to generate puzzle suggestions or returned an empty/malformed suggestions list.');
    }

    const strictlyValidSuggestionsWithDefinitions: z.infer<typeof PuzzleSuggestionSchema>[] = [];
    const apiKey = process.env.NEXT_PUBLIC_WORDSAPI_KEY;

    if (!apiKey || apiKey === "YOUR_WORDSAPI_KEY_PLACEHOLDER" || apiKey.length < 10) {
      console.warn("WordsAPI key not configured or is placeholder. Cannot fetch definitions. No suggestions will be returned.");
      // Early exit if API key is not usable, as definitions are now a required part of the output schema.
      return { suggestions: [] };
    }

    for (const rawSuggestion of rawOutputFromPrompt.suggestions) {
      const wordOfTheDayText = rawSuggestion.wordOfTheDayText.toUpperCase().trim();
      const seedingLetters = rawSuggestion.seedingLetters.toUpperCase().trim();

      if (!/^[A-Z]{6,9}$/.test(wordOfTheDayText)) {
        console.warn(`AI returned WotD '${wordOfTheDayText}' with invalid format/length. Filtering out.`);
        continue;
      }
      if (!/^[A-Z]{9}$/.test(seedingLetters)) {
        console.warn(`AI returned Seeding Letters '${seedingLetters}' for WotD '${wordOfTheDayText}' with invalid format/length. Filtering out.`);
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
          console.warn(`AI returned WotD '${wordOfTheDayText}' which is not formable from Seeding Letters '${seedingLetters}'. Filtering out.`);
          continue;
      }
      
      // Fetch definition from WordsAPI
      let wordOfTheDayDefinition = "";
      try {
        // Using /definitions endpoint as it's more direct for getting just definitions.
        const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${wordOfTheDayText.toLowerCase()}/definitions`, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
          }
        });

        if (response.ok) {
          const data = await response.json();
          // WordsAPI /definitions endpoint returns { word: "...", definitions: [{ definition: "...", partOfSpeech: "..."}] }
          if (data.definitions && data.definitions.length > 0 && data.definitions[0].definition) {
            wordOfTheDayDefinition = data.definitions[0].definition;
          } else {
            console.warn(`No definition found for WotD '${wordOfTheDayText}' via WordsAPI. Filtering out this suggestion.`);
            continue; 
          }
        } else {
          console.warn(`WordsAPI request for '${wordOfTheDayText}' failed with status ${response.status}. Filtering out this suggestion.`);
          continue; 
        }
      } catch (error: any) {
        console.error(`Error fetching definition for WotD '${wordOfTheDayText}' from WordsAPI: ${error.message}. Filtering out this suggestion.`);
        continue; 
      }

      if (wordOfTheDayDefinition) { // Ensure definition was successfully fetched
        strictlyValidSuggestionsWithDefinitions.push({
          wordOfTheDayText,
          seedingLetters,
          wordOfTheDayDefinition,
        });
      }
    }
    
    if (strictlyValidSuggestionsWithDefinitions.length === 0 && rawOutputFromPrompt.suggestions.length > 0) {
        console.warn("All suggestions from AI were filtered out due to validation failures or inability to fetch definitions after prompt execution.");
    }
    
    return { suggestions: strictlyValidSuggestionsWithDefinitions };
  }
);
