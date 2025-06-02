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
  date: z.string().describe('The date of the game session.'),
});
export type GenerateShareableMomentInput = z.infer<typeof GenerateShareableMomentInputSchema>;

const GenerateShareableMomentOutputSchema = z.object({
  shareableText: z.string().describe('The text to be shared on social media.'),
  imageUri: z.string().describe('The data URI of the generated shareable image.'),
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
  prompt: `You are a creative social media manager for Lexiverse, a word puzzle game. Generate a fun and engaging shareable moment for a player based on their game performance. The player's information is below:

  Date: {{{date}}}
  Score: {{{score}}}
  Guessed Word of the Day: {{#if guessedWotD}}Yes{{else}}No{{/if}}
  Words Found: {{{wordsFoundCount}}}
  {{#if circleName}}Circle: {{{circleName}}}{{/if}}

  Create a short text (under 280 characters) to share on social media and generate an image to accompany it.
  The text should highlight the player's score and Word of the Day status, and should encourage others to play Lexiverse. The generated image should be visually appealing and relevant to the game.
  The image should have the score, the words found, the date and the WotD status overlaid on top of it in a visually appealing manner using white 'Inter' font.

  Ensure that the response includes the text in the 'shareableText' field and the image data URI in the 'imageUri' field. The image must be a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'.
`,
});

const generateShareableMomentFlow = ai.defineFlow(
  {
    name: 'generateShareableMomentFlow',
    inputSchema: GenerateShareableMomentInputSchema,
    outputSchema: GenerateShareableMomentOutputSchema,
  },
  async input => {
    const {output} = await shareableMomentPrompt(input);
    return output!;
  }
);
