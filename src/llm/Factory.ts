import { ILLMProvider } from '../interfaces';
import { GeminiLLM } from './GeminiLLM';

export function createLLMProvider(): ILLMProvider {
    const provider = process.env.PROVIDER || 'google';

    switch (provider) {
        case 'google':
            return new GeminiLLM();
        default:
            throw new Error(`Unsupported LLM provider: ${provider}`);
    }
}
