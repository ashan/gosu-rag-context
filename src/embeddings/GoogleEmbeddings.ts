import { GoogleGenerativeAI } from '@google/generative-ai';
import { IEmbeddingProvider } from '../interfaces';
import * as dotenv from 'dotenv';

dotenv.config();

export class GoogleEmbeddings implements IEmbeddingProvider {
    private client: GoogleGenerativeAI;
    private model: string;

    constructor() {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY is required for Google embeddings');
        }
        this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        this.model = process.env.EMBEDDING_MODEL || 'text-embedding-004';
    }

    async embed(texts: string[]): Promise<number[][]> {
        const embedModel = this.client.getGenerativeModel({ model: this.model });
        const results: number[][] = [];

        // Google's SDK currently prefers sequential or batched. 
        // For simplicity and to avoid rate limits on free tier, we'll do sequential or small batches.
        // Current interface takes string[], so we loop.

        for (const text of texts) {
            try {
                // Ensure text is not empty
                if (!text.trim()) {
                    results.push([]); // Or zero vector? Better to skip or valid payload.
                    continue;
                }
                const result = await embedModel.embedContent(text);
                results.push(result.embedding.values);
            } catch (error) {
                console.error('Google Embedding Error:', error);
                throw error;
            }
        }

        return results;
    }
}
