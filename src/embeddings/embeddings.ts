import { OpenAIEmbeddingFunction, GoogleGenerativeAiEmbeddingFunction } from 'chromadb';
import type { IEmbeddingFunction } from 'chromadb';
import { loadConfig, type Config } from '../config/env.js';

/**
 * Default embedding models for each provider
 */
const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
    openai: 'text-embedding-ada-002',
    google: 'text-embedding-004',
};

/**
 * Create an embedding function based on configuration
 */
export function createEmbeddingFunction(config?: Config): IEmbeddingFunction {
    const cfg = config || loadConfig();

    const embeddingProvider = cfg.embeddingProvider;
    const embeddingModel = cfg.embeddingModel || DEFAULT_EMBEDDING_MODELS[embeddingProvider];

    switch (embeddingProvider) {
        case 'openai': {
            const apiKey = cfg.embeddingApiKey || cfg.openaiApiKey;
            if (!apiKey) {
                throw new Error('OpenAI API key required for OpenAI embeddings');
            }
            return new OpenAIEmbeddingFunction({
                openai_api_key: apiKey,
                openai_model: embeddingModel,
            });
        }

        case 'google': {
            const apiKey = cfg.embeddingApiKey || cfg.googleApiKey;
            if (!apiKey) {
                throw new Error('Google API key required for Google embeddings');
            }
            return new GoogleGenerativeAiEmbeddingFunction({
                googleApiKey: apiKey,
                model: embeddingModel,
            });
        }

        default:
            throw new Error(`Unsupported embedding provider: ${embeddingProvider}`);
    }
}
