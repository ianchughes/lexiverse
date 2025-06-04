
import { config } from 'dotenv';
config();

import '@/ai/flows/generate-shareable-moment.ts';
import '@/ai/flows/generate-puzzle-suggestions.ts';
import '@/ai/flows/handle-suggestion-flow.ts'; 
// No need to import admin actions here as they are not Genkit flows for direct dev testing.

    