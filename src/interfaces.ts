export interface IEmbeddingProvider {
    embed(texts: string[]): Promise<number[][]>;
}

export interface ILLMProvider {
    generate(prompt: string): Promise<string>;
}

export interface QueryResult {
    id: string;
    score: number;
    content: string;
    metadata: Record<string, any>;
    collection: string;
}
