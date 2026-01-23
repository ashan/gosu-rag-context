/**
 * Metadata structure for code chunks (from gosu-rag ingestion)
 */
export interface ChunkMetadata {
    /** Full file path */
    absolutePath: string;

    /** Path relative to source root */
    relativePath: string;

    /** Guidewire module (policycenter, billingcenter, etc.) */
    module?: string;

    /** Package or namespace */
    package?: string;

    /** Class or template name */
    className?: string;

    /** Method or function name */
    methodName?: string;

    /** Type of chunk */
    chunkType: ChunkType;

    /** Language: 'gosu' or 'gosu_template' */
    language: string;

    /** Starting line number in source file */
    lineStart: number;

    /** Ending line number in source file */
    lineEnd: number;

    /** SHA-256 content hash for change detection */
    contentHash: string;

    /** Allow for additional metadata fields (e.g. from docs) */
    [key: string]: any;
}

/**
 * Possible chunk types from gosu-rag
 */
export type ChunkType =
    | 'package'
    | 'class'
    | 'interface'
    | 'enum'
    | 'function'
    | 'method'
    | 'property'
    | 'template_directive'
    | 'template_block'
    | 'file';

/**
 * Search result from vector store
 */
export interface SearchHit {
    /** Unique chunk identifier */
    chunkId: string;

    /** Chunk text content */
    text: string;

    /** Similarity score (optional, higher is better) */
    score?: number;

    /** Distance metric (optional, lower is better for Euclidean) */
    distance?: number;

    /** Chunk metadata */
    metadata: ChunkMetadata;

    /** Collection name this hit came from (for multi-collection support) */
    collectionName?: string;
}

/**
 * Filter options for vector store queries
 */
export interface QueryFilter {
    /** Filter by Guidewire module (policycenter, billingcenter, etc.) */
    module?: string;

    /** Filter by package name */
    package?: string;

    /** Filter by class name (exact match) */
    className?: string;

    /** Filter by chunk type */
    chunkType?: ChunkType;

    /** Filter by language */
    language?: 'gosu' | 'gosu_template';

    /** Filter by relative path (partial match) */
    relativePath?: string;

    /** Custom metadata filters */
    [key: string]: any;
}

/**
 * Result from file retrieval
 */
export interface FileResult {
    /** File path */
    filePath: string;

    /** Complete file contents (aggregated from chunks) */
    contents: string;

    /** Metadata from the file */
    metadata?: Partial<ChunkMetadata>;
}

/**
 * Vector store adapter interface - allows swapping implementations
 */
export interface VectorStoreAdapter {
    /**
     * Search for chunks by symbol name
     * @param symbol Symbol, class, or function name to search for
     * @param filePaths Optional file path filters
     * @returns Matching code chunks with metadata
     */
    searchBySymbolName(symbol: string, filePaths?: string[]): Promise<SearchHit[]>;

    /**
     * Retrieve complete file contents by path
     * @param filePath Relative file path
     * @returns Aggregated file contents
     */
    getFileByPath(filePath: string): Promise<FileResult>;

    /**
     * Search chunks by regex pattern
     * @param pattern Regular expression pattern
     * @param filePaths Optional file path filters
     * @returns Matching code chunks
     */
    regexSearch(pattern: string, filePaths?: string[]): Promise<SearchHit[]>;

    /**
     * Semantic search using embeddings
     * @param query Natural language query
     * @param topK Number of results to return
     * @param filter Optional metadata filters
     * @returns Top-K semantically similar chunks
     */
    semanticSearch(query: string, topK?: number, filter?: QueryFilter): Promise<SearchHit[]>;

    /**
     * Health check for vector store connectivity
     * @returns true if connected and healthy
     */
    healthCheck(): Promise<boolean>;

    /**
     * Get collection names being queried
     * @returns Array of collection names
     */
    getCollectionNames(): string[];
}
