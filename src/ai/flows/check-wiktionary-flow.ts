'use server';
/**
 * @fileOverview A Genkit flow to check Wiktionary for word existence and its primary English definition.
 *
 * - checkWiktionary - A function that queries Wiktionary.
 * - CheckWiktionaryInput - The input type (the word).
 * - CheckWiktionaryOutput - The output type (existence, definition, raw extract).
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Define Zod Schemas for input and output
const CheckWiktionaryInputSchema = z.object({
  word: z.string().min(1, "Word cannot be empty.").describe('The word to check on Wiktionary.'),
});
export type CheckWiktionaryInput = z.infer<typeof CheckWiktionaryInputSchema>;

const CheckWiktionaryOutputSchema = z.object({
  exists: z.boolean().describe('Whether the word page was found on Wiktionary.'),
  definition: z.string().nullable().describe('The primary English definition found, or null if not found/parsable.'),
  rawExtract: z.string().nullable().describe('The raw text extract from Wiktionary, if any page content was returned.'),
});
export type CheckWiktionaryOutput = z.infer<typeof CheckWiktionaryOutputSchema>;

// Exported wrapper function to call the flow
export async function checkWiktionary(input: CheckWiktionaryInput): Promise<CheckWiktionaryOutput> {
  return checkWiktionaryFlow(input);
}

// The Genkit flow implementation
const checkWiktionaryFlow = ai.defineFlow(
  {
    name: 'checkWiktionaryFlow',
    inputSchema: CheckWiktionaryInputSchema,
    outputSchema: CheckWiktionaryOutputSchema,
  },
  async (input) => {
    const { word } = input;
    // Added &redirects=1 to automatically resolve redirects on the API side.
    const apiUrl = `https://en.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext&format=json&redirects=1&titles=${encodeURIComponent(word.toLowerCase())}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'LexiVerseApp/1.0 (Firebase Studio Integration; +https://lexiverse.game)', // Polite User-Agent
        }
      });

      if (!response.ok) {
        console.error(`Wiktionary API request for "${word}" failed: ${response.status} ${response.statusText}`);
        return { exists: false, definition: null, rawExtract: null };
      }

      const data = await response.json();

      if (!data.query || !data.query.pages) {
        console.error(`Wiktionary API returned unexpected data structure for "${word}":`, data);
        return { exists: false, definition: null, rawExtract: null };
      }

      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];

      // If pageId is -1, the page does not exist. Check for 'missing' property as well for robustness.
      if (!pageId || pageId === "-1" || pages[pageId].missing !== undefined) {
        return { exists: false, definition: null, rawExtract: null }; // Word does not exist
      }

      const extract: string | undefined = pages[pageId].extract;
      if (!extract) {
        // The page exists but there's no text content (e.g., it's a category page).
        return { exists: true, definition: null, rawExtract: null };
      }

      // Heuristic to find the primary English definition.
      // 1. Find the "==English==" section.
      // 2. Look for the first line starting with "# " (a definition), but not "#:" (an example).
      let firstDefinition: string | null = null;
      
      const englishSectionMatch = extract.match(/==\s*English\s*==([\s\S]*?)(?:\n==\s*|$)/i);
      const contentToSearch = englishSectionMatch ? englishSectionMatch[1] : extract;

      const definitionLines = contentToSearch.split('\n');
      for (const line of definitionLines) {
        if (line.startsWith('# ') && !line.startsWith('#:')) {
          // Cleanup common wikitext markup for readability.
          firstDefinition = line
            .substring(2) // Remove "# "
            .replace(/\{\{[^}]*\}\}/g, '') // Remove {{templates}}
            .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1') // Simplify [[wikilinks|display]] to display
            .replace(/'''(.*?)'''/g, '$1') // Remove bold
            .replace(/''(.*?)''/g, '$1')   // Remove italics
            .replace(/\s{2,}/g, ' ')      // Collapse multiple spaces
            .trim();
          
          if (firstDefinition) break; // Found the first valid definition, stop searching.
        }
      }
      
      return { exists: true, definition: firstDefinition, rawExtract: extract };

    } catch (error: any) {
      console.error(`Error during Wiktionary API call for "${word}":`, error);
      // This catches network errors or issues with fetch itself.
      return { exists: false, definition: null, rawExtract: null };
    }
  }
);
