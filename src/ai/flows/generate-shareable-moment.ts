
'use server';

/**
 * @fileOverview Generates a shareable moment after a game session, highlighting the player's score and Word of the Day status.
 *
 * - generateShareableMoment - A function that generates a shareable moment.
 * - GenerateShareableMomentInput - The input type for the generateShareableMoment function.
 * - GenerateShareableMomentOutput - The return type for the generateShareableMoment function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateShareableMomentInputSchema = z.object({
  score: z.number().describe('The player\'s score in the game.'),
  guessedWotD: z.boolean().describe('Whether the player guessed the Word of the Day.'),
  wordsFoundCount: z.number().describe('The number of words found by the player.'),
  circleName: z.string().optional().describe('The name of the player\'s circle, if any.'),
  date: z.string().describe('The date of the game session in YYYY-MM-DD format.'),
  newlyClaimedWordsCount: z.number().optional().describe('Number of new words claimed this session.'),
});
export type GenerateShareableMomentInput = z.infer<typeof GenerateShareableMomentInputSchema>;

const GenerateShareableMomentOutputSchema = z.object({
  shareableText: z.string().describe('A concise and engaging text summary of the game results, formatted for social media sharing. Must use specified multi-line structure and emojis.'),
  imageUri: z.string().describe('The data URI of the generated shareable image. The image should be visually appealing, relevant to LexiVerse, and could include elements like the game logo, score, words found, date, WotD status, and new words claimed, overlaid in a clean font like Inter.'),
});
export type GenerateShareableMomentOutput = z.infer<typeof GenerateShareableMomentOutputSchema>;

export async function generateShareableMoment(input: GenerateShareableMomentInput): Promise<GenerateShareableMomentOutput> {
  return generateShareableMomentFlow(input);
}

const shareableMomentPrompt = ai.definePrompt({
  name: 'shareableMomentPrompt',
  input: {
    schema: GenerateShareableMomentInputSchema,
  },
  output: {
    schema: GenerateShareableMomentOutputSchema,
  },
  config: {
    model: 'googleai/gemini-2.0-flash-exp', // Specifies the LLM model
    responseModalities: ['TEXT', 'IMAGE'],
    templateFormat: "handlebars",
    handlebars: {
      helpers: {
        gt: (a: number, b: number) => a > b,
      },
    },
  },
  prompt: `You are a creative social media manager for LexiVerse, a daily word puzzle game. Generate a shareable moment for a player based on their game performance.

Player's Game Data:
- Date: {{date}} (This is in YYYY-MM-DD format)
- Score: {{{score}}}
- Words Found: {{{wordsFoundCount}}}
- Guessed Word of the Day: {{#if guessedWotD}}Yes{{else}}No{{/if}}
{{#if circleName}}- Playing with Circle: {{{circleName}}} 🤝{{/if}}
{{#if newlyClaimedWordsCount}}{{#if (gt newlyClaimedWordsCount 0)}}✨ {{newlyClaimedWordsCount}} new words claimed!{{/if}}{{/if}}

Your Task:
1.  **Shareable Text (for social media):**
    *   Craft an engaging, multi-line text summary suitable for social media.
    *   **Format the date provided as {{date}} (YYYY-MM-DD) into dd/mm/yyyy format for the output.**
    *   The structure MUST be exactly as follows, including line breaks and emojis:
        LexiVerse Results! 🗓️ [dd/mm/yyyy formatted date]

        🏆 {{score}} Points
        ✍️ {{wordsFoundCount}} Words Found
        💡 Word of the Day: {{#if guessedWotD}}Guessed! 🎉{{else}}Missed 😥{{/if}}
        {{#if newlyClaimedWordsCount}}{{#if (gt newlyClaimedWordsCount 0)}}✨ {{newlyClaimedWordsCount}} new words claimed!{{/if}}{{/if}}

        Join the fun & challenge your lexicon! Play LexiVerse daily! #LexiVerse
    *   The line "✨ X new words claimed!" should ONLY be included if 'newlyClaimedWordsCount' is greater than 0.
    *   The text MUST end with the call to action and #LexiVerse hashtag.

2.  **Shareable Image (imageUri):**
    *   Generate an image to accompany the social media post. The image should have an aspect ratio of approximately 2:1 (e.g., 1000x500 pixels, wider than tall).
    *   The image should be visually appealing and themed around LexiVerse (e.g., abstract letter patterns, a subtle representation of a brain, a stylized lexicon or dictionary).
    *   Overlay the following information clearly onto the image using a clean, readable white 'Inter' font. Ensure the text is well-distributed or centered, making good use of the available image space and avoiding excessive empty areas.
        *   LexiVerse logo (a simple "LV" or "LexiVerse" text is fine if a logo isn't available)
        *   Date: {{date}} (Keep as YYYY-MM-DD for the image)
        *   Score: {{score}}
        *   Words Found: {{wordsFoundCount}}
        *   WotD Status: {{#if guessedWotD}}Guessed! ✅{{else}}Missed ❌{{/if}}
        {{#if newlyClaimedWordsCount}}{{#if (gt newlyClaimedWordsCount 0)}}*   New Words Claimed: {{newlyClaimedWordsCount}}{{/if}}{{/if}} (Include this line in the image ONLY if newlyClaimedWordsCount > 0)
    *   The image must be a data URI: 'data:<mimetype>;base64,<encoded_data>'.

Return the response in the specified JSON format with 'shareableText' and 'imageUri' fields.
`,
});

const generateShareableMomentFlow = ai.defineFlow(
  {
    name: 'generateShareableMomentFlow',
    inputSchema: GenerateShareableMomentInputSchema,
    outputSchema: GenerateShareableMomentOutputSchema,
  },
  async (input) => {
    const fallbackText = `LexiVerse Results! 🗓️ ${input.date.split('-').reverse().join('/')}\n\n🏆 ${input.score} Points\n✍️ ${input.wordsFoundCount} Words Found\n💡 Word of the Day: ${input.guessedWotD ? 'Guessed! 🎉' : 'Missed 😥'}\n${input.newlyClaimedWordsCount && input.newlyClaimedWordsCount > 0 ? `✨ ${input.newlyClaimedWordsCount} new words claimed!\n` : ''}\nJoin the fun & challenge your lexicon! Play LexiVerse daily! #LexiVerse`;
    // A slightly more appealing placeholder image (2:1 ratio)
    const fallbackImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+KAAAAAXNSR0IArs4c6QAAAIRlWElmTU0AKgAAAAgABQESAAMAAAABAAEAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAIdpAAQAAAABAAAAWgAAAAAAAACQAAAAAQAAAJAAAAABUGFpbnQuTkVUIHY0LjMuMTIAAAACoAIABAAAAAEAAAH0oAMABAAAAAEAAAH0AAAAALG3iDIAAAAFSURBVHgB7cEBAQAAAIIg/69uSEABAAAAAAAAAAAAAAA+A44rAAEFj07xAAAAAElFTkSuQmCC";

    try {
      const { output } = await shareableMomentPrompt(input);
      
      if (!output || !output.imageUri || !output.shareableText) {
          console.error("[generateShareableMomentFlow] AI failed to generate complete shareable moment. Output:", output);
          return { 
              shareableText: output?.shareableText || fallbackText, 
              imageUri: output?.imageUri || fallbackImage 
          };
      }
      // Ensure shareableText has line breaks if the AI missed them (it should follow the prompt)
      const formattedText = output.shareableText.replace(/\\n/g, '\n');
      return { ...output, shareableText: formattedText };

    } catch (flowError: any) {
        console.error(`[generateShareableMomentFlow] Error executing shareableMomentPrompt. Message: ${flowError.message}. Stack: ${flowError.stack}. Full error:`, flowError);
        return { 
            shareableText: fallbackText, 
            imageUri: fallbackImage 
        };
    }
  }
);

