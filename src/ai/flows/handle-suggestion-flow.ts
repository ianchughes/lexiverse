
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
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import type { UserProfile } from '@/types';

const HandleSuggestionInputSchema = z.object({
  userId: z.string().optional().describe('The ID of the user making the suggestion, if logged in.'),
  suggestionText: z.string().min(1, {message: "Suggestion text cannot be empty."}).describe('The user\'s suggestion for improving the game.'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })).optional().describe('Previous messages in the conversation, if any.'),
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
Your personality should be friendly, helpful, and encouraging.
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
1. Acknowledge their suggestion positively.
2. If the suggestion is very short or unclear, you can ask a gentle, open-ended clarifying question (e.g., "Could you tell me a bit more about that?" or "That sounds interesting, what specifically did you have in mind?"). Do this sparingly.
3. If the suggestion is reasonably clear, thank them for their input and assure them it will be considered by the team.
4. Keep your responses concise and friendly. Avoid making promises about implementing the suggestion.

Examples:
User: "It would be cool to have themes for the letters."
Bot: "Thanks for that idea! Themed letters sound like a fun addition. We'll definitely keep that in mind."

User: "More colors."
Bot: "More colors, got it! Could you tell me a bit more about where you'd like to see different colors?"

Respond to the user's suggestion: "{{{suggestionText}}}"
Bot:`,
  templateFormat: "handlebars",
});

const handleSuggestionFlow = ai.defineFlow(
  {
    name: 'handleSuggestionFlow',
    inputSchema: HandleSuggestionInputSchema,
    outputSchema: HandleSuggestionOutputSchema,
  },
  async (input) => {
    let botResponseText = "Thanks for your suggestion! I'll make sure our team sees it."; 

    try {
      const { output, history } = await suggestionPrompt(input); 
      if (output?.response) {
        botResponseText = output.response;
      } else {
        console.warn("[handleSuggestionFlow] AI did not return a response. Using fallback. History:", history);
      }
    } catch (flowError: any) {
      console.error(`[handleSuggestionFlow] Error executing suggestionPrompt: ${flowError.message}`, flowError);
    }

    try {
      const suggestionLogData: any = {
        suggestionText: input.suggestionText,
        botResponse: botResponseText,
        conversationHistory: input.conversationHistory || [],
        timestamp: serverTimestamp(),
        status: 'Pending', // Set initial status
      };
      if (input.userId) {
        suggestionLogData.userId = input.userId;
        // Denormalize username for easier admin display
        const userDocRef = doc(firestore, 'Users', input.userId);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserProfile;
          suggestionLogData.username = userData.username;
        }
      }
      await addDoc(collection(firestore, 'UserSuggestions'), suggestionLogData);
    } catch (error) {
      console.error("[handleSuggestionFlow] Error saving user suggestion to Firestore:", error);
    }

    return {response: botResponseText};
  }
);

    