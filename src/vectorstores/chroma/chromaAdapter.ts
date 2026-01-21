import { ChromaClient, Collection } from 'chromadb';
import type {
    VectorStoreAdapter,
    SearchHit,
    FileResult,
    QueryFilter,
} from '../VectorStoreAdapter.js';
import { loadConfig, getChromaUrl } from '../../config/env.js';
import { chromaMetadataToChunkMetadata } from './types.js';
import { createEmbeddingFunction } from '../../embeddings/embeddings.js';

/**
 * ChromaDB adapter implementation supporting multiple collections
 */
export class ChromaAdapter implements VectorStoreAdapter {
    private client: ChromaClient;
    private collections: Map<string, Collection> = new Map();
    private collectionNames: string[];
    private config = loadConfig();

    constructor() {
        const chromaUrl = getChromaUrl(this.config);
        this.client = new ChromaClient({ path: chromaUrl });
        this.collectionNames = this.config.chromaCollections;
    }

    /**
     * Connect to all configured Chroma collections
     */
    async connect(): Promise<void> {
        try {
            // Create embedding function based on configuration
            const embedder = createEmbeddingFunction(this.config);

            for (const collectionName of this.collectionNames) {
                const collection = await this.client.getCollection({
                    name: collectionName,
                    embeddingFunction: embedder,
                });
                this.collections.set(collectionName, collection);
                console.log(`[ChromaAdapter] Connected to collection: ${collectionName}`);
            }
        } catch (error) {
            console.error('[ChromaAdapter] Failed to connect to ChromaDB:', error);
            throw new Error(
                `Failed to connect to ChromaDB at ${getChromaUrl(this.config)}. ` +
                `Ensure ChromaDB is running and collections exist.`
            );
        }
    }

    /**
     * Search for chunks by symbol name across all collections
     */
    async searchBySymbolName(symbol: string, filePaths?: string[]): Promise<SearchHit[]> {
        const allHits: SearchHit[] = [];

        for (const [collectionName, collection] of this.collections) {
            try {
                // Build where clause for metadata filtering
                const where: Record<string, any> = {};

                // Symbol search: check className and methodName
                // Use $or to match either className or methodName
                const symbolConditions: Record<string, any>[] = [];

                // Check if className contains the symbol
                symbolConditions.push({ className: { $contains: symbol } });

                // Check if methodName contains the symbol
                symbolConditions.push({ methodName: { $contains: symbol } });

                // If filePaths provided, add path filter
                if (filePaths && filePaths.length > 0) {
                    // Match any of the provided paths
                    const pathConditions = filePaths.map(p => ({ relativePath: { $contains: p } }));
                    where.$and = [
                        { $or: symbolConditions },
                        { $or: pathConditions }
                    ];
                } else {
                    where.$or = symbolConditions;
                }

                // Get all matching documents
                const whereClause = Object.keys(where).length > 0 ? where : undefined;
                const results = await collection.get({
                    ...(whereClause && { where: whereClause }),
                    limit: 100, // Get up to 100 matches per collection
                });

                // Convert to SearchHits
                if (results.ids && results.ids.length > 0) {
                    for (let i = 0; i < results.ids.length; i++) {
                        const metadata = results.metadatas?.[i];
                        const document = results.documents?.[i];

                        const id = results.ids[i];
                        if (metadata && document && id) {
                            allHits.push({
                                chunkId: id,
                                text: document,
                                metadata: chromaMetadataToChunkMetadata(metadata),
                                collectionName,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[ChromaAdapter] Error searching collection ${collectionName}:`, error);
            }
        }

        // Reconstruct split nodes if needed
        return this.reconstructSplitNodes(allHits);
    }

    /**
     * Get complete file contents by aggregating all chunks
     */
    async getFileByPath(filePath: string): Promise<FileResult> {
        const allChunks: SearchHit[] = [];

        for (const [collectionName, collection] of this.collections) {
            try {
                const results = await collection.get({
                    where: { relativePath: filePath },
                    limit: 1000, // Large number to get all chunks of a file
                });

                if (results.ids && results.ids.length > 0) {
                    for (let i = 0; i < results.ids.length; i++) {
                        const metadata = results.metadatas?.[i];
                        const document = results.documents?.[i];

                        const id = results.ids[i];
                        if (metadata && document && id) {
                            allChunks.push({
                                chunkId: id,
                                text: document,
                                metadata: chromaMetadataToChunkMetadata(metadata),
                                collectionName,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[ChromaAdapter] Error getting file from collection ${collectionName}:`, error);
            }
        }

        if (allChunks.length === 0) {
            throw new Error(`File not found: ${filePath}`);
        }

        // Sort by line start
        allChunks.sort((a, b) => a.metadata.lineStart - b.metadata.lineStart);

        // Aggregate contents
        const contents = allChunks.map(chunk => chunk.text).join('\n\n');

        return {
            filePath,
            contents,
            ...(allChunks[0] && { metadata: allChunks[0].metadata }),
        };
    }

    /**
     * Search chunks using regex pattern
     */
    async regexSearch(pattern: string, filePaths?: string[]): Promise<SearchHit[]> {
        const allHits: SearchHit[] = [];

        // Handle case-insensitive flag (?i)
        let regexPattern = pattern;
        let flags = '';
        if (regexPattern.startsWith('(?i)')) {
            regexPattern = regexPattern.substring(4);
            flags = 'i';
        }

        const regex = new RegExp(regexPattern, flags);

        for (const [collectionName, collection] of this.collections) {
            try {
                // Build where clause for file paths if provided
                const where: Record<string, any> = {};
                if (filePaths && filePaths.length > 0) {
                    where.$or = filePaths.map(p => ({ relativePath: { $contains: p } }));
                }

                // Get documents (client-side regex filtering)
                const whereClause = Object.keys(where).length > 0 ? where : undefined;
                const results = await collection.get({
                    ...(whereClause && { where: whereClause }),
                    limit: 1000,
                });

                if (results.ids && results.ids.length > 0) {
                    for (let i = 0; i < results.ids.length; i++) {
                        const document = results.documents?.[i];
                        const metadata = results.metadatas?.[i];

                        const id = results.ids[i];
                        if (document && metadata && id && regex.test(document)) {
                            allHits.push({
                                chunkId: id,
                                text: document,
                                metadata: chromaMetadataToChunkMetadata(metadata),
                                collectionName,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[ChromaAdapter] Error regex search in collection ${collectionName}:`, error);
            }
        }

        return allHits;
    }

    /**
     * Semantic search using embeddings
     */
    async semanticSearch(query: string, topK?: number, filter?: QueryFilter): Promise<SearchHit[]> {
        const k = topK || this.config.topK;
        const allHits: SearchHit[] = [];

        for (const [collectionName, collection] of this.collections) {
            // Enforce collection filtering if specified
            if (filter?.collectionName && filter.collectionName !== collectionName) {
                continue;
            }

            try {
                // Build where clause from filter
                const where = this.buildWhereClause(filter);

                // Query with embeddings
                const whereClause = Object.keys(where).length > 0 ? where : undefined;
                const results = await collection.query({
                    queryTexts: [query],
                    nResults: k,
                    ...(whereClause && { where: whereClause }),
                });

                // Transform results
                if (results.ids && results.ids[0]) {
                    for (let i = 0; i < results.ids[0].length; i++) {
                        const metadata = results.metadatas?.[0]?.[i];
                        const document = results.documents?.[0]?.[i];
                        const distance = results.distances?.[0]?.[i] ?? 0;

                        const id = results.ids[0]?.[i];
                        if (metadata && document && id) {
                            // Convert distance to similarity score: 1 / (1 + distance)
                            // Convert distance to similarity score: 1 / (1 + distance)
                            const score = 1 / (1 + distance);
                            const chunkMetadata = chromaMetadataToChunkMetadata(metadata);

                            // Client-side filtering for relativePath (Chroma metadata filter doesn't support $contains)
                            if (filter?.relativePath) {
                                if (!chunkMetadata.relativePath || !chunkMetadata.relativePath.includes(filter.relativePath)) {
                                    continue;
                                }
                            }

                            allHits.push({
                                chunkId: id,
                                text: document,
                                score,
                                distance,
                                metadata: chunkMetadata,
                                collectionName,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`[ChromaAdapter] Error semantic search in collection ${collectionName}:`, error);
            }
        }

        // Sort by score (descending) and take top K across all collections
        allHits.sort((a, b) => (b.score || 0) - (a.score || 0));
        return allHits.slice(0, k);
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.heartbeat();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get collection names
     */
    getCollectionNames(): string[] {
        return this.collectionNames;
    }

    /**
     * Build Chroma where clause from query filter
     */
    private buildWhereClause(filter?: QueryFilter): Record<string, any> {
        const where: Record<string, any> = {};

        if (!filter) {
            return where;
        }

        if (filter.package) {
            where.package = filter.package;
        }

        if (filter.className) {
            where.className = filter.className;
        }

        if (filter.chunkType) {
            where.chunkType = filter.chunkType;
        }

        if (filter.language) {
            where.language = filter.language;
        }



        return where;
    }

    /**
     * Reconstruct nodes that were split across multiple chunks
     * Groups by relativePath + className + methodName, sorts by lineStart
     */
    private reconstructSplitNodes(hits: SearchHit[]): SearchHit[] {
        // Group chunks that might be split
        const groups = new Map<string, SearchHit[]>();

        for (const hit of hits) {
            const key = `${hit.metadata.relativePath}|${hit.metadata.className || ''}|${hit.metadata.methodName || ''}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(hit);
        }

        const reconstructed: SearchHit[] = [];

        // For each group, if multiple chunks, merge them
        for (const [_key, chunks] of groups) {
            if (chunks.length === 1 && chunks[0]) {
                reconstructed.push(chunks[0]);
            } else if (chunks.length > 1 && chunks[0]) {
                // Sort by line start
                chunks.sort((a, b) => a.metadata.lineStart - b.metadata.lineStart);

                // Merge into single hit
                const firstChunk = chunks[0];
                const merged: SearchHit = {
                    chunkId: chunks.map(c => c.chunkId).join('+'),
                    text: chunks.map(c => c.text).join('\n'),
                    ...(firstChunk.score !== undefined && { score: firstChunk.score }),
                    ...(firstChunk.distance !== undefined && { distance: firstChunk.distance }),
                    metadata: {
                        ...firstChunk.metadata,
                        lineStart: Math.min(...chunks.map(c => c.metadata.lineStart)),
                        lineEnd: Math.max(...chunks.map(c => c.metadata.lineEnd)),
                    },
                    ...(firstChunk.collectionName && { collectionName: firstChunk.collectionName }),
                };

                reconstructed.push(merged);
            }
        }

        return reconstructed;
    }
}
