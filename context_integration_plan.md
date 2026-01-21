# Context Integration Plan: Guidewire Documentation

This plan outlines the changes required to integrate the new `docs` collection from `chroma-rag-docs` into the `gosu-chroma-rag-context` agent. This will enable the agent to retrieve official Guidewire documentation alongside codebase search.

## User Review Required

> [!IMPORTANT]
> **Collection Name**: We must ensure the `docs` collection name in `.env` matches the one created by `chroma-rag-docs`.
> **Prompt Engineering**: The agent needs to know *when* to use documentation vs code search. We will need to tune the system prompt.

## Proposed Changes

### Configuration

#### [MODIFY] [src/config/env.ts](file:///Users/dev/typescript/gosu-chroma-rag-context/src/config/env.ts)
-   Update `chromaCollections` default to include `docs` (e.g., `'guidewire-code,docs'`).
-   Or specifically add `chromaDocsCollection` config if we want to separate them explicitly (recommended for clarity).

### Tools

#### [NEW] [src/tools/implementations/docSearch.ts](file:///Users/dev/typescript/gosu-chroma-rag-context/src/tools/implementations/docSearch.ts)
-   Create `GuidewireDocsTool` implementing the `Tool` interface.
-   Connects to the `docs` collection in Chroma.
-   Performs semantic search similar to `SemanticSearchTool` but specific to documentation.
-   Returns `category`, `source` (filename), `page`, and `content`.

#### [MODIFY] [src/tools/registry.ts](file:///Users/dev/typescript/gosu-chroma-rag-context/src/tools/registry.ts)
-   Register the new `GuidewireDocsTool`.

### Prompts

#### [MODIFY] [prompts/agent_system.md](file:///Users/dev/typescript/gosu-chroma-rag-context/prompts/agent_system.md)
-   Add instructions on when to use `guidewire_docs_search`.
-   Example: "Use `guidewire_docs_search` when the user asks about configuration, API usage, or general concepts. Use `codebase_search` for specific implementation details."

## Verification

### Manual Test
1.  **Update Config**: `CHROMA_COLLECTIONS=guidewire-code,docs` in `.env`.
2.  **Run Agent**: `npm run start`.
3.  **Query**: "How do I configure contact manager?"
4.  **Verify**: Agent should call `guidewire_docs_search` and return relevant info from the PDF ingestion.
