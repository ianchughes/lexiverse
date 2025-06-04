
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
});
export type GenerateShareableMomentInput = z.infer<typeof GenerateShareableMomentInputSchema>;

const GenerateShareableMomentOutputSchema = z.object({
  shareableText: z.string().describe('A concise and engaging text summary of the game results, suitable for social media (e.g., Twitter, Mastodon). Should include score, words found, WotD status, and tastefully use emojis. Should end with a call to action to play LexiVerse and include #LexiVerse hashtag.'),
  imageUri: z.string().describe('The data URI of the generated shareable image. The image should be visually appealing, relevant to LexiVerse, and could include elements like the game logo, score, words found, date, and WotD status overlaid in a clean font like Inter.'),
});
export type GenerateShareableMomentOutput = z.infer<typeof GenerateShareableMomentOutputSchema>;

export async function generateShareableMoment(input: GenerateShareableMomentInput): Promise<GenerateShareableMomentOutput> {
  return generateShareableMomentFlow(input);
}

const shareableMomentPrompt = ai.definePrompt({
  name: 'shareableMomentPrompt',
  model: 'googleai/gemini-2.0-flash-exp',
  config: {
    responseModalities: ['TEXT', 'IMAGE'],
  },
  input: {
    schema: GenerateShareableMomentInputSchema,
  },
  output: {
    schema: GenerateShareableMomentOutputSchema,
  },
  prompt: `You are a creative social media manager for LexiVerse, a daily word puzzle game. Generate a shareable moment for a player based on their game performance.

Player's Game Data for {{date}}:
- Score: {{{score}}}
- Words Found: {{{wordsFoundCount}}}
- Guessed Word of the Day: {{#if guessedWotD}}Yes! 🎉{{else}}No 🤔{{/if}}
{{#if circleName}}- Playing with Circle: {{{circleName}}} 🤝{{/if}}

Your Task:
1.  **Shareable Text (for social media):**
    *   Craft a short, engaging, and concise text summary (under 280 characters).
    *   It should be exciting and make others want to play.
    *   Include: player's score, number of words found, and Word of the Day status.
    *   Use emojis tastefully to enhance the message (e.g., ✨, 💡, 🏆).
    *   The text MUST end with a call to action like "Play LexiVerse daily!" and include the hashtag #LexiVerse.
    *   Example style: "LexiVerse {{date}}: Scored {{{score}}} points & found {{{wordsFoundCount}}} words! {{#if guessedWotD}}Nailed the WotD! 🥳{{else}}Missed the WotD today. 😅{{/if}} Join the fun! Play LexiVerse daily! #LexiVerse"

2.  **Shareable Image (imageUri):**
    *   Generate an image to accompany the social media post.
    *   The image should be visually appealing and themed around LexiVerse (e.g., abstract letter patterns, a subtle representation of a brain, a stylized lexicon or dictionary).
    *   Overlay the following information clearly onto the image using a clean, readable white 'Inter' font:
        *   LexiVerse logo (a simple "LV" or "LexiVerse" text is fine if a logo isn't available)
        *   Date: {{date}}
        *   Score: {{score}}
        *   Words Found: {{wordsFoundCount}}
        *   WotD Status: {{#if guessedWotD}}Guessed! ✅{{else}}Missed ❌{{/if}}
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
    try {
      const { output, history } = await shareableMomentPrompt(input);
      
      if (!output || !output.imageUri || !output.shareableText) {
          console.error("[generateShareableMomentFlow] AI failed to generate complete shareable moment. Output or history:", output, history);
          const fallbackText = `I played LexiVerse on ${input.date}! Scored ${input.score}, found ${input.wordsFoundCount} words. ${input.guessedWotD ? 'Got the Word of the Day! 🎉' : 'Missed the WotD. 😥'} Play LexiVerse! #LexiVerse`;
          const fallbackImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Placeholder
          return { 
              shareableText: output?.shareableText || fallbackText, 
              imageUri: output?.imageUri || fallbackImage 
          };
      }
      return output;
    } catch (flowError: any) {
        console.error(`[generateShareableMomentFlow] Error executing shareableMomentPrompt. Message: ${flowError.message}. Stack: ${flowError.stack}. Full error:`, flowError);
        const fallbackText = `LexiVerse results for ${input.date}: ${input.score}pts, ${input.wordsFoundCount} words. WotD: ${input.guessedWotD ? 'Yes!' : 'No'}. #LexiVerse`;
        const fallbackImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Placeholder
        return { 
            shareableText: fallbackText, 
            imageUri: fallbackImage 
        };
    }
  }
);

