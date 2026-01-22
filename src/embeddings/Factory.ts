import { IEmbeddingProvider } from '../interfaces';
import { GoogleEmbeddings } from './GoogleEmbeddings';

export function createEmbeddingProvider(): IEmbeddingProvider {
    const provider = process.env.EMBEDDING_PROVIDER || 'google';

    switch (provider) {
        case 'google':
            return new GoogleEmbeddings();
        default:
            throw new Error(`Unsupported embedding provider: ${provider}`);
    }
}
