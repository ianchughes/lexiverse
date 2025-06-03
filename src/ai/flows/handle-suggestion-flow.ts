
'use server';
/**
 * @fileOverview Handles user suggestions via an AI chat interface and logs them.
 *
 * - handleUserSuggestion - A function that takes a user's suggestion, logs it, and returns an AI response.
 * - HandleSuggestionInput - The input type for the handleUserSuggestion function.
 * - HandleSuggestionOutput - The return type for the handleUserSuggestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const HandleSuggestionInputSchema = z.object({
  userId: z.string().optional().describe('The ID of the user making the suggestion, if logged in.'),
  suggestionText: z.string().min(1, {message: "Suggestion text cannot be empty."}).describe('The user\'s suggestion for improving the game.'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })).optional().describe('Previous messages in the conversation, if any.'),
  uiTone: z.number().min(1).max(10).optional().describe('The desired UI tone for the bot\'s response (1: jovial, 10: formal). Default is 5 (neutral).'),
});
export type HandleSuggestionInput = z.infer<typeof HandleSuggestionInputSchema>;

const HandleSuggestionOutputSchema = z.object({
  response: z.string().describe('The AI bot\'s response to the user\'s suggestion.'),
});
export type HandleSuggestionOutput = z.infer<typeof HandleSuggestionOutputSchema>;

export async function handleUserSuggestion(input: HandleSuggestionInput): Promise<HandleSuggestionOutput> {
  return handleSuggestionFlow(input);
}

const suggestionPrompt = ai.definePrompt({
  name: 'handleSuggestionPrompt',
  input: {schema: HandleSuggestionInputSchema},
  output: {schema: HandleSuggestionOutputSchema},
  prompt: `You are a suggestions bot for a word puzzle game called LexiVerse.
Your personality should adapt based on the 'uiTone' parameter (a scale of 1-10, where 1 is very jovial/playful and 10 is very formal/obsequious).
If uiTone is low (e.g., 1-3), be more playful and enthusiastic.
If uiTone is high (e.g., 8-10), be more formal, polite, and use respectful language.
If uiTone is mid-range (e.g., 4-7) or not provided, maintain a friendly, helpful, and encouraging tone.
Your current UI Tone is: {{uiTone_description uiTone}}

Your goal is to encourage users to provide feedback and make them feel heard.

Conversation History (if any):
{{#if conversationHistory}}
{{#each conversationHistory}}
{{this.role}}: {{this.content}}
{{/each}}
{{/if}}

The user has just provided the following suggestion:
User: {{{suggestionText}}}

Your tasks:
1. Acknowledge their suggestion positively, adapting your language to the specified 'uiTone'.
2. If the suggestion is very short or unclear, you can ask a gentle, open-ended clarifying question (e.g., "Could you tell me a bit more about that?" or "That sounds interesting, what specifically did you have in mind?"). Do this sparingly.
3. If the suggestion is reasonably clear, thank them for their input and assure them it will be considered by the team.
4. Keep your responses concise and friendly (or formal, based on uiTone). Avoid making promises about implementing the suggestion.

Examples (assuming neutral tone if uiTone not specified):
User: "It would be cool to have themes for the letters."
Bot: "Thanks for that idea! Themed letters sound like a fun addition. We'll definitely keep that in mind."

User: "More colors."
Bot: "More colors, got it! Could you tell me a bit more about where you'd like to see different colors?"

Respond to the user's suggestion: "{{{suggestionText}}}"
Bot:`,
  templateFormat: "handlebars",
  model: {
    helpers: {
      uiTone_description: (tone?: number) => {
        const t = tone || 5; // Default to neutral
        if (t <= 1) return "1 (Extremely Playful/Jovial)";
        if (t <= 3) return `${t} (Playful/Casual)`;
        if (t <= 4) return `${t} (Friendly/Casual)`;
        if (t <= 6) return `${t} (Neutral/Helpful)`;
        if (t <= 7) return `${t} (Polite/Helpful)`;
        if (t <= 9) return `${t} (Formal/Professional)`;
        return `${t} (Extremely Formal/Obsequious)`;
      }
    }
  }
});

const handleSuggestionFlow = ai.defineFlow(
  {
    name: 'handleSuggestionFlow',
    inputSchema: HandleSuggestionInputSchema,
    outputSchema: HandleSuggestionOutputSchema,
  },
  async (input) => {
    // If uiTone is not provided, default to 5 (neutral friendly) for the prompt.
    const effectiveInput = { ...input, uiTone: input.uiTone ?? 5 };
    const {output} = await suggestionPrompt(effectiveInput);

    const botResponseText = output?.response || "Thanks for your suggestion! I'll make sure our team sees it.";

    try {
      const suggestionLogData: any = {
        suggestionText: input.suggestionText,
        botResponse: botResponseText,
        conversationHistory: input.conversationHistory || [],
        timestamp: serverTimestamp(),
        uiToneUsed: effectiveInput.uiTone, // Log the tone used
      };
      if (input.userId) {
        suggestionLogData.userId = input.userId;
      }
      await addDoc(collection(firestore, 'UserSuggestions'), suggestionLogData);
    } catch (error) {
      console.error("Error saving user suggestion to Firestore:", error);
      // We'll still return the bot's response even if saving fails
    }

    return {response: botResponseText};
  }
);

    