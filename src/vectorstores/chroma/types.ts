/**
 * Chroma-specific type definitions
 */

import type { ChunkMetadata } from '../VectorStoreAdapter.js';

/**
 * Chroma metadata structure (matches gosu-rag ingestion format)
 */
export interface ChromaMetadata {
    absolutePath: string;
    relativePath: string;
    package?: string;
    className?: string;
    methodName?: string;
    chunkType: string;
    language: string;
    lineStart: number;
    lineEnd: number;
    contentHash: string;
}

/**
 * Chroma query result structure
 */
export interface ChromaQueryResult {
    ids: string[][];
    embeddings: number[][] | null;
    documents: (string | null)[][];
    metadatas: (Record<string, any> | null)[][];
    distances: (number | null)[][];
}

/**
 * Convert Chroma metadata to our ChunkMetadata type
 */
export function chromaMetadataToChunkMetadata(chromaMeta: Record<string, any>): ChunkMetadata {
    const metadata: ChunkMetadata = {
        absolutePath: String(chromaMeta.absolutePath || ''),
        relativePath: String(chromaMeta.relativePath || ''),
        chunkType: String(chromaMeta.chunkType) as any,
        language: String(chromaMeta.language),
        lineStart: Number(chromaMeta.lineStart) || 0,
        lineEnd: Number(chromaMeta.lineEnd) || 0,
        contentHash: String(chromaMeta.contentHash || ''),
    };

    // Only add optional fields if they exist
    if (chromaMeta.package) {
        metadata.package = String(chromaMeta.package);
    }
    if (chromaMeta.className) {
        metadata.className = String(chromaMeta.className);
    }
    if (chromaMeta.methodName) {
        metadata.methodName = String(chromaMeta.methodName);
    }

    return {
        ...chromaMeta,
        ...metadata
    };
}
