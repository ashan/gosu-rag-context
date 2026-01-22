import { IEmbeddingProvider } from '../interfaces.js';
import { GoogleEmbeddings } from './GoogleEmbeddings.js';

export function createEmbeddingProvider(): IEmbeddingProvider {
    const provider = process.env.EMBEDDING_PROVIDER || 'google';

    switch (provider) {
        case 'google':
            return new GoogleEmbeddings();
        default:
            throw new Error(`Unsupported embedding provider: ${provider}`);
    }
}
