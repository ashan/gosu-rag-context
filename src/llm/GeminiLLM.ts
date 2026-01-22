import { GoogleGenerativeAI } from '@google/generative-ai';
import { ILLMProvider } from '../interfaces';
import * as dotenv from 'dotenv';

dotenv.config();

export class GeminiLLM implements ILLMProvider {
    private client: GoogleGenerativeAI;
    private model: string;

    constructor() {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY is required for Gemini');
        }
        this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        this.model = process.env.MODEL || 'gemini-2.0-flash';
    }

    async generate(prompt: string): Promise<string> {
        const model = this.client.getGenerativeModel({ model: this.model });

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini Generation Error:', error);
            throw error;
        }
    }
}
