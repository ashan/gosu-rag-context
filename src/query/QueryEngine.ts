import { ChromaClient, Collection } from 'chromadb';
import { IEmbeddingProvider, ILLMProvider, QueryResult } from '../interfaces';
import { createEmbeddingProvider } from '../embeddings/Factory';
import { createLLMProvider } from '../llm/Factory';
import * as dotenv from 'dotenv';

dotenv.config();

interface QueryOptions {
    topK?: number;
    includeCode?: boolean;
    includeDocs?: boolean;
}

export class QueryEngine {
    private chroma: ChromaClient;
    private embedder: IEmbeddingProvider;
    private llm: ILLMProvider;
    private codeCollectionName: string;
    private docsCollectionName: string;

    constructor() {
        this.chroma = new ChromaClient({
            path: `http://${process.env.CHROMA_HOST || 'localhost'}:${process.env.CHROMA_PORT || 8000}`,
        });
        this.embedder = createEmbeddingProvider();
        this.llm = createLLMProvider();
        this.codeCollectionName = process.env.CODE_COLLECTION || 'guidewire-code';
        this.docsCollectionName = process.env.DOCS_COLLECTION || 'guidewire-docs';
    }

    async query(text: string, options: QueryOptions = {}) {
        const topK = options.topK || 5;
        const includeCode = options.includeCode !== false; // default true
        const includeDocs = options.includeDocs !== false; // default true

        console.log(`🔍 Generating embedding for: "${text}"`);
        const queryEmbedding = (await this.embedder.embed([text]))[0];

        const results: QueryResult[] = [];

        // 1. Query Code Collection
        if (includeCode) {
            try {
                const collection = await this.getCollection(this.codeCollectionName);
                if (collection) {
                    const response = await collection.query({
                        queryEmbeddings: [queryEmbedding],
                        nResults: topK,
                    });

                    if (response.ids.length > 0) {
                        const ids = response.ids[0];
                        const distances = response.distances ? response.distances[0] : [];
                        const metadatas = response.metadatas ? response.metadatas[0] : [];
                        const documents = response.documents ? response.documents[0] : [];

                        ids.forEach((id, idx) => {
                            if (documents[idx]) {
                                results.push({
                                    id,
                                    score: distances[idx] ?? 0, // distance (lower is better usually in Chroma defaults, but let's handle as is)
                                    content: documents[idx] || '',
                                    metadata: metadatas[idx] || {},
                                    collection: 'code'
                                });
                            }
                        });
                    }
                }
            } catch (error) {
                console.warn(`⚠️  Failed to query code collection: ${error}`);
            }
        }

        // 2. Query Docs Collection
        if (includeDocs) {
            try {
                const collection = await this.getCollection(this.docsCollectionName);
                if (collection) {
                    const response = await collection.query({
                        queryEmbeddings: [queryEmbedding],
                        nResults: topK,
                    });

                    if (response.ids.length > 0) {
                        const ids = response.ids[0];
                        const distances = response.distances ? response.distances[0] : [];
                        const metadatas = response.metadatas ? response.metadatas[0] : [];
                        const documents = response.documents ? response.documents[0] : [];

                        ids.forEach((id, idx) => {
                            if (documents[idx]) {
                                results.push({
                                    id,
                                    score: distances[idx] ?? 0,
                                    content: documents[idx] || '',
                                    metadata: metadatas[idx] || {},
                                    collection: 'docs'
                                });
                            }
                        });
                    }
                }
            } catch (error) {
                console.warn(`⚠️  Failed to query docs collection: ${error}`);
            }
        }

        // 3. Rerank / Sort
        // Chroma default distance is L2 (Euclidean), lower is better.
        // If cosine, lower is ... wait. Chroma default is L2.
        // Let's sort by score ASC (closest distance).
        results.sort((a, b) => a.score - b.score);

        // Limit to topK total across both if desired, or just return mixed list.
        // For now, let's keep all retrieved (up to topK * 2) to give LLM more context, or slice?
        // Let's slice to global topK * 1.5 to be generous but not overflow context.
        const finalResults = results.slice(0, Math.ceil(topK * 1.5));

        console.log(`✅ Found ${finalResults.length} relevant chunks.`);

        // 4. Generate Answer
        const context = finalResults.map(r => {
            const source = r.collection === 'code'
                ? `[Code: ${r.metadata.relativePath || r.metadata.source}]`
                : `[Doc: ${r.metadata.source} (Page ${r.metadata.page})]`;
            return `${source}\n${r.content}`;
        }).join('\n\n---\n\n');

        const systemPrompt = `You are a helpful expert on Guidewire/Gosu development.
Use the provided Context to answer the user's Question.
If the answer is not in the context, say you don't know.
Cite sources (filenames) where possible.
Prioritize code examples from the context.
`;

        const userPrompt = `Context:\n${context}\n\nQuestion: ${text}`;

        console.log('🤖 Synthesizing answer...');
        const answer = await this.llm.generate(`${systemPrompt}\n\n${userPrompt}`);

        return {
            results: finalResults,
            answer
        };
    }

    private async getCollection(name: string): Promise<Collection | null> {
        try {
            return await this.chroma.getCollection({
                name,
                embeddingFunction: {
                    generate: (texts) => this.embedder.embed(texts)
                }
            });
        } catch (e) {
            console.warn(`Collection ${name} not found or error accessing it.`);
            return null;
        }
    }
}
