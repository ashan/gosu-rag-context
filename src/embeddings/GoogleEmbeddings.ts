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

        // Remove empty strings to prevent API errors
        // (Though we need to maintain index alignment, so we might replace with space or track indices)
        // For now, let's assume upstream handles empty check or we embed a space.

        const results: number[][] = [];

        // Google batch limit is usually 100
        const batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10);

        // Helper to chunk array
        for (let i = 0; i < texts.length; i += batchSize) {
            const chunk = texts.slice(i, i + batchSize);

            // Prepare requests for batchEmbedContents
            // 'content' must be of type Content.
            const requests = chunk.map(t => ({
                content: { role: 'user', parts: [{ text: t || ' ' }] }
            }));

            try {
                // @ts-ignore - SDK typing might be slightly different in various versions, but structure is standard
                const batchResult = await embedModel.batchEmbedContents({ requests });

                if (batchResult.embeddings) {
                    batchResult.embeddings.forEach(e => {
                        results.push(e.values || []);
                    });
                }
            } catch (error) {
                console.error('Google Batch Embedding Error:', error);
                // Fallback to serial if batch fails? Or throw?
                // Throwing is safer for consistency.
                throw error;
            }
        }

        return results;
    }
}
