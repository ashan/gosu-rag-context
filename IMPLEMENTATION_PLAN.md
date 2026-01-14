# Implementation Plan: RAG Agent Tooling for Gosu/Guidewire Codebase

## 📋 Project Overview

**Goal**: Create a vector-DB-agnostic RAG agent tooling system that consumes the already-ingested data from `gosu-rag` (https://github.com/ashan/gosu-rag) and provides an intelligent query interface for the Gosu/Guidewire codebase.

**Key Constraints**:
- ✅ DO: Read from existing ingestion metadata and Chroma collections
- ❌ DON'T: Re-implement ingestion or re-chunk data
- 🔧 All configuration via `.env` (prompts, URLs, model settings, etc.)
- 🔌 Pluggable tool schema formats (OpenAI default, Anthropic supported)
- 🧠 Single tool call per turn architecture

---

## 🎯 Phase 1: Project Scaffolding & Configuration

### Step 1.1: Initialize TypeScript Project Structure
**Deliverables**:
- [ ] Create directory structure matching the specified layout
- [ ] Initialize `package.json` with:
  - `"type": "module"` for ESM support
  - Scripts: `build`, `dev`, `start`, `lint`, `test`
  - Engine requirement: `node >= 20`
  - Dependencies: `zod`, `zod-to-json-schema`, `dotenv`, `chromadb`, `openai`, `@anthropic-ai/sdk`
  - Dev dependencies: `typescript`, `tsx`, `@types/node`, `vitest` (or `jest`)

**Files to Create**:
- `package.json`
- `tsconfig.json` (strict mode, ESM, outDir=dist)
- `.gitignore` (node_modules, dist, .env)

### Step 1.2: Research `gosu-rag` Configuration
**Action Items**:
- [ ] Inspect `gosu-rag` repository to discover:
  - Chroma server URL configuration
  - Collection name(s) used
  - Metadata schema (symbolName, filePath, symbolType, line ranges, etc.)
  - Tenant/database settings if applicable
  - Embedding model used
- [ ] Document findings for `.env.example` creation

**Questions to Answer**:
1. What are the exact Chroma collection names created by `gosu-rag`?
2. What metadata fields are attached to each chunk?
3. Are there separate collections for `.gs` files vs `.gst` templates?
4. What is the chunking strategy used (semantic units, fixed-size, etc.)?

### Step 1.3: Create Configuration System
**Files to Create**:
- `src/config/env.ts` - Reads all environment variables with validation
- `src/config/prompts.ts` - Default prompts with env override capability
- `.env.example` - Complete template with:
  - Provider settings (PROVIDER, MODEL, API keys)
  - TOOL_FORMAT (openai/anthropic)
  - Chroma settings (mirrored from gosu-rag)
  - Prompt overrides
  - Runtime settings (MAX_TURNS, TOP_K)

**Validation Requirements**:
- Use Zod schemas to validate env variables
- Fail fast with clear error messages if required vars are missing
- Provide sensible defaults where possible

---

## 🎯 Phase 2: Core Abstractions & Interfaces

### Step 2.1: Define Zod Schemas
**File**: `src/planning/schemas.ts`

**Schemas to Implement**:
- [ ] `PlanStepSchema` - { id, title, description, status }
- [ ] `PlanSchema` - Ordered array of PlanSteps
- [ ] `StepOutcomeSchema` - { stepId, status, summary }
- [ ] `PlanDecisionSchema` - { decision: 'continue'|'finalize'|'revise', reason, newSteps? }

### Step 2.2: Vector Store Adapter Interface
**File**: `src/vectorstores/VectorStoreAdapter.ts`

**Interface Definition**:
```typescript
interface SearchHit {
  chunkId: string;
  text: string;
  score?: number;
  metadata: {
    symbolName?: string;
    filePath?: string;
    [key: string]: any; // Extensible for other metadata
  };
}

interface VectorStoreAdapter {
  searchBySymbolName(symbol: string, filePaths?: string[]): Promise<SearchHit[]>;
  getFileByPath(filePath: string): Promise<{ filePath: string; contents: string }>;
  regexSearch(pattern: string, filePaths?: string[]): Promise<SearchHit[]>;
  semanticSearch(query: string, topK?: number, filter?: Record<string, any>): Promise<SearchHit[]>;
}
```

### Step 2.3: Tool Interface & Registry
**Files**: 
- `src/tools/Tool.ts` - Base interface
- `src/tools/registry.ts` - Tool registration and spec emission

**Tool Interface**:
```typescript
interface Tool<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters: ZodSchema<TParams>;
  parse(raw: unknown): TParams;
  execute(args: TParams, ctx: ToolContext): Promise<TResult>;
  toToolSpec(format: 'openai' | 'anthropic'): object;
}
```

**ToolContext**:
```typescript
interface ToolContext {
  vectorStore: VectorStoreAdapter;
  // Extensible for future needs
}
```

---

## 🎯 Phase 3: Vector Store Implementation

### Step 3.1: Chroma Adapter Core
**File**: `src/vectorstores/chroma/chromaAdapter.ts`

**Implementation Requirements**:
- [ ] Initialize ChromaDB client with env settings
- [ ] Connect to collection(s) specified in `.env`
- [ ] Implement metadata-based filtering
- [ ] Handle node reconstruction (when symbols split across chunks)

**Key Methods**:
- `searchBySymbolName()` - Filter by metadata.symbolName
- `getFileByPath()` - Aggregate all chunks for a file, sort by line number/position
- `regexSearch()` - Client-side regex if Chroma doesn't support it
- `semanticSearch()` - Use collection.query() with embeddings

### Step 3.2: Chroma Types
**File**: `src/vectorstores/chroma/types.ts`

**Type Definitions**:
- Chroma-specific metadata structure
- Collection configuration
- Query response types

**Questions**:
1. Should we cache collection metadata on startup?
2. How do we handle multiple collections (code vs templates)?
3. What's the strategy for reconstructing split nodes?

---

## 🎯 Phase 4: Tool Implementations

### Step 4.1: Symbol Search Tool
**File**: `src/tools/implementations/symbolSearch.ts`

**Functionality**:
- Search by symbolName metadata
- Optional filePaths filter
- Reconstruct split nodes into coherent snippets
- Return symbol location, code, and metadata

### Step 4.2: File Get Tool
**File**: `src/tools/implementations/fileGet.ts`

**Functionality**:
- Retrieve all chunks for a given filePath
- Sort and aggregate into complete file contents
- Handle missing files gracefully

### Step 4.3: Regex Search Tool
**File**: `src/tools/implementations/regexSearch.ts`

**Functionality**:
- Run regex pattern against chunk texts
- Optional filePaths restriction
- Return matching chunks with context

### Step 4.4: Semantic Search Tool
**File**: `src/tools/implementations/semanticSearch.ts`

**Functionality**:
- Embedding-backed similarity search
- TopK parameter (default from env)
- Optional metadata filters
- Return ranked results

---

## 🎯 Phase 5: Tool Schema Adapters

### Step 5.1: OpenAI Tool Adapter
**File**: `src/tools/adapters/openaiToolAdapter.ts`

**Functionality**:
- Convert Zod schemas to OpenAI function tool format
- Use `zod-to-json-schema` library
- Export transformation function

### Step 5.2: Anthropic Tool Adapter
**File**: `src/tools/adapters/anthropicToolAdapter.ts`

**Functionality**:
- Convert Zod schemas to Anthropic input_schema format
- Handle any format differences
- Export transformation function

---

## 🎯 Phase 6: LLM Provider Abstraction

### Step 6.1: Build LLM Factory
**File**: `src/providers/buildLLM.ts`

**Interface**:
```typescript
interface LLMClient {
  chat(
    messages: Message[],
    tools: ToolSpec[],
    options: { parallel_tool_calls: boolean }
  ): Promise<{ content?: string; tool_call?: ToolCall }>;
  
  structuredOutput<T>(
    messages: Message[],
    schema: ZodSchema<T>
  ): Promise<T>;
}
```

**Implementations**:
- [ ] OpenAI provider
- [ ] Anthropic provider
- [ ] Azure OpenAI provider

**Questions**:
1. Should we support streaming responses?
2. How do we handle rate limiting/retries?
3. What's the error handling strategy for provider failures?

---

## 🎯 Phase 7: Agent Runtime Components

### Step 7.1: Planner
**File**: `src/planning/planner.ts`

**Function**: `planFromQuery(llm, userQuery)`

**Flow**:
1. Construct planner system prompt (from config)
2. Call LLM with structured output (PlanSchema)
3. Validate and return Plan
4. No prose, structured JSON only

### Step 7.2: Step Runner
**File**: `src/runtime/stepRunner.ts`

**Function**: `runStep(llm, vectorStore, tools, step, userQuery)`

**Flow**:
1. Build message array:
   - System: "Solve ONE step; call tools; then answer"
   - Developer: Available tools, metadata schema, current step details
   - User: Original question
2. Loop:
   - Call LLM with tools (parallel_tool_calls: false)
   - If tool_call: parse → execute → append result
   - Guard: MAX_TURNS limit
3. Request structured StepOutcome
4. Return outcome

**Questions**:
1. How do we handle tool execution errors?
2. Should we log tool calls for debugging?
3. What's the strategy for infinite loops?

### Step 7.3: Evaluator
**File**: `src/runtime/evaluator.ts`

**Function**: `evaluate(llm, recentOutcome, remainingSteps)`

**Flow**:
1. Build context with recent outcome and remaining steps
2. Call LLM with structured output (PlanDecisionSchema)
3. Return decision: continue | finalize | revise
4. If revise: include newSteps

### Step 7.4: Finalizer
**File**: `src/runtime/finalizer.ts`

**Function**: `finalize(llm, allOutcomes, userQuery)`

**Flow**:
1. Aggregate all step outcomes
2. Synthesize final answer grounded in retrieved code
3. Cite file paths and symbols
4. State limitations if any
5. Suggest next steps if incomplete

### Step 7.5: Agent Orchestrator
**File**: `src/runtime/agent.ts`

**Function**: `runAgent(llm, vectorStore, question)`

**Flow**:
1. Verify vector store connectivity (read-only check)
2. Plan ← planFromQuery(llm, question)
3. For each step:
   - outcome ← runStep(...)
   - decision ← evaluate(...)
   - If decision === 'continue': next step
   - If decision === 'finalize': break
   - If decision === 'revise': update plan
4. finalAnswer ← finalize(...)
5. Return finalAnswer

---

## 🎯 Phase 8: Utility Modules

### Step 8.1: Message Construction
**File**: `src/utils/messages.ts`

**Functions**:
- `buildSystemMessage(prompt: string)`
- `buildDeveloperMessage(content: string)`
- `buildUserMessage(content: string)`
- `buildToolResultMessage(toolName: string, result: any)`

### Step 8.2: Error Handling
**File**: `src/utils/errors.ts`

**Error Types**:
- `ConfigError` - Missing/invalid env vars
- `ToolError` - Tool execution failures
- `VectorStoreError` - Vector DB connectivity issues
- `LLMError` - Provider API failures
- Type guards and error formatting

---

## 🎯 Phase 9: CLI & Entry Point

### Step 9.1: Main Entry Point
**File**: `src/main.ts`

**Flow**:
1. Load dotenv config
2. Parse CLI arguments (question from argv)
3. Validate env configuration
4. Build LLM client from env
5. Build vector store adapter from env
6. Call runAgent(llm, vectorStore, question)
7. Print final answer to stdout
8. Handle errors gracefully

**CLI Usage**:
```bash
npm run start "How does autoscroll work?"
```

---

## 🎯 Phase 10: Documentation & Testing

### Step 10.1: README.md
**Sections**:
- [ ] Project introduction and purpose
- [ ] Architecture overview with diagrams
- [ ] How it works (Planner → Runner → Evaluator → Finalizer)
- [ ] Installation instructions
- [ ] Configuration guide (detailed .env documentation)
- [ ] Usage examples
- [ ] Extending the system (new tools, new vector stores)
- [ ] Troubleshooting
- [ ] Integration with gosu-rag

### Step 10.2: Unit Tests
**Test Coverage**:
- [ ] Zod schema validation
- [ ] Tool parameter parsing (valid/invalid cases)
- [ ] Vector store adapter with mocks
- [ ] Tool spec transformation (OpenAI/Anthropic)
- [ ] Message construction utilities
- [ ] Error handling and type guards

**Framework**: Vitest (preferred) or Jest

### Step 10.3: Integration Tests (Optional)
- [ ] End-to-end flow with mock LLM responses
- [ ] Vector store connectivity (requires local Chroma)
- [ ] CLI execution

---

## 🎯 Phase 11: Querying Agent System Prompt

### Step 11.1: Create Agent System Prompt
**Files**: 
- `AGENT_SYSTEM_PROMPT.md` (root directory) - The actual prompt content
- `src/config/agentPrompt.ts` - Loader with variable substitution

**Purpose**: The agent system prompt lives in an **external markdown file** (not hardcoded) to enable:
- Easy customization without code changes
- Version control and review of prompt changes
- Team collaboration on prompt engineering
- A/B testing different prompt strategies

**Architecture**:

1. **Prompt Storage** - `AGENT_SYSTEM_PROMPT.md` in project root
   - Written in markdown for readability
   - Contains template variables: `{{COLLECTIONS}}`, `{{METADATA_FIELDS}}`, `{{TOP_K}}`, `{{MAX_TURNS}}`
   - Versioned with the codebase
   - Can be customized per deployment

2. **Prompt Loader** - `src/config/agentPrompt.ts`
   - Reads prompt from file path specified in `.env`
   - Performs variable substitution
   - Returns final prompt string
   - Caches loaded prompt for performance

3. **Configuration in `.env`**:
   ```bash
   # Agent System Prompt Configuration
   AGENT_SYSTEM_PROMPT_PATH=./AGENT_SYSTEM_PROMPT.md
   
   # Optional: Override with custom prompt file
   # AGENT_SYSTEM_PROMPT_PATH=./prompts/custom-agent-prompt.md
   ```

**Implementation**:

**File: `src/config/agentPrompt.ts`**
```typescript
import fs from 'fs';
import path from 'path';
import { loadConfig } from './env.js';

interface AgentPromptConfig {
  collections: string[];
  metadataFields: string[];
  topK: number;
  maxTurns: number;
}

let cachedPrompt: string | null = null;

/**
 * Load agent system prompt from external markdown file with variable substitution
 */
export function loadAgentSystemPrompt(config: AgentPromptConfig): string {
  // Return cached if available
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const envConfig = loadConfig();
  const promptPath = envConfig.agentSystemPromptPath || './AGENT_SYSTEM_PROMPT.md';
  
  // Resolve relative to project root
  const absolutePath = path.resolve(process.cwd(), promptPath);
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Agent system prompt file not found: ${absolutePath}\n` +
      `Please ensure AGENT_SYSTEM_PROMPT.md exists or set AGENT_SYSTEM_PROMPT_PATH in .env`
    );
  }
  
  // Read template
  let template = fs.readFileSync(absolutePath, 'utf-8');
  
  // Perform variable substitution
  const substitutions: Record<string, string> = {
    '{{COLLECTIONS}}': config.collections.join(', '),
    '{{METADATA_FIELDS}}': config.metadataFields.join(', '),
    '{{TOP_K}}': config.topK.toString(),
    '{{MAX_TURNS}}': config.maxTurns.toString(),
  };
  
  for (const [variable, value] of Object.entries(substitutions)) {
    template = template.replace(new RegExp(variable, 'g'), value);
  }
  
  // Cache and return
  cachedPrompt = template;
  return cachedPrompt;
}

/**
 * Clear cached prompt (useful for testing or hot-reloading)
 */
export function clearPromptCache(): void {
  cachedPrompt = null;
}
```

**File: `AGENT_SYSTEM_PROMPT.md` (Template Content)**

This file should contain the comprehensive agent system prompt with the following **template variables** for dynamic substitution:

- `{{COLLECTIONS}}` - Replaced with comma-separated collection names from `.env`
- `{{METADATA_FIELDS}}` - Replaced with available metadata field names
- `{{TOP_K}}` - Replaced with the default topK value from `.env`
- `{{MAX_TURNS}}` - Replaced with the maximum turns limit from `.env`

**Full Template Content**:

The complete agent system prompt template is documented in the `CLAUDE_SYSTEM_PROMPT.md` file under the "🤖 Querying Agent System Prompt" section. This template includes:

1. **Agent Identity** - Expert in THIS specific Guidewire Gosu codebase
2. **Codebase Context** - Technology stack, languages, collections, metadata
3. **Available Tools** - Detailed descriptions of all 4 tools with examples
4. **Tool Usage Strategy** - Recommended workflow and query patterns
5. **Critical Rules** - Anti-hallucination prohibitions and requirements
6. **Response Format** - Good/bad examples with citations
7. **Error Handling** - Strategies for no results, unclear results, multi-step queries
8. **Constraints** - Max turns, top-K limits, read-only access
9. **Success Criteria** - What constitutes good vs failed responses

**Sample excerpt with template variables**:
```markdown
# Expert Guidewire Gosu Codebase Assistant

## Codebase Context

- **Collections**: {{COLLECTIONS}}
- **Metadata Fields**: {{METADATA_FIELDS}}

## Available Tools

### 4. semantic_search(query: string, topK?: number, filter?: object)
**Returns**: Top-K most semantically similar code chunks (default: {{TOP_K}}).

## Constraints

- **Max Turns**: {{MAX_TURNS}} tool calls to gather information
- **Top-K Default**: {{TOP_K}} results from semantic_search

## Critical Rules

### ❌ NEVER HALLUCINATE
- Only reference code that tools returned
- Don't invent method/class names
- Don't cite line numbers without tool evidence

### ✅ ALWAYS CITE SOURCES
- Format: `filepath:lineStart-lineEnd`
- Example: `nz/co/acc/Account.gs:45-67`
```

**Note**: During implementation, copy the full template from `CLAUDE_SYSTEM_PROMPT.md` (the "Querying Agent System Prompt" section) to create `AGENT_SYSTEM_PROMPT.md`, ensuring template variables are used where configuration values should be injected.



### Step 11.2: Example Queries Documentation
**File**: `EXAMPLE_QUERIES.md`

Create extensive examples showing:
- Simple symbol lookups
- Complex multi-step queries
- How to handle "not found" scenarios
- Best practices for different query types

**Categories**:
1. Finding specific code elements (classes, functions, etc.)
2. Understanding workflows and processes
3. Finding usage examples
4. Exploring architecture and relationships
5. Debugging and troubleshooting queries

### Step 11.3: Demo Scripts
**Files**: `examples/*.ts`

Create runnable example scripts:
- `examples/simple-query.ts` - Basic symbol search
- `examples/complex-query.ts` - Multi-step investigation
- `examples/semantic-explore.ts` - Semantic search examples
- `examples/file-analysis.ts` - File retrieval and analysis
- `examples/batch-queries.ts` - Processing multiple questions

Each script should:
- Show the question
- Show the tool calls made
- Show the response
- Include commentary on strategy



## 🔍 Open Questions & Clarifications Needed

### 1. gosu-rag Integration Details ✅ ANSWERED
**Metadata Schema** (from inspection):
- `absolutePath`: string - Full file path
- `relativePath`: string - Path from source root
- `package`: string (optional) - Package/namespace
- `className`: string (optional) - Class or template name
- `methodName`: string (optional) - Method/function name
- `chunkType`: 'package' | 'class' | 'interface' | 'enum' | 'function' | 'method' | 'property' | 'template_directive' | 'template_block' | 'file'
- `language`: 'gosu' | 'gosu_template'
- `lineStart`: number - Starting line in source
- `lineEnd`: number - Ending line in source
- `contentHash`: string - SHA-256 for change detection

**Chroma Configuration**:
- Default collection: `guidewire-code`
- Host: `localhost`
- Port: `8000`
- Single collection for .gs, .gst, and .gsx files

### 2. Node Reconstruction Strategy ✅ ANSWERED
**Approach**: Concatenate chunks by line number when multiple chunks share the same:
- `relativePath`
- `className` (if applicable)
- `methodName` (if applicable)

Sort by `lineStart` and merge content with proper line breaks.

### 3. Multi-Collection Support ✅ ANSWERED
**Implementation**:
- ✅ Support multiple collections (future-proofing)
- ✅ Allow simultaneous querying of all configured collections
- ✅ Allow .env configuration for available collections (comma-separated list)
- ✅ Auto-detect and merge results from multiple collections
- ✅ Include collection name in search results metadata

Example `.env`:
```bash
CHROMA_COLLECTIONS=guidewire-code,custom-templates,external-libs
```

### 4. Error Recovery Strategy ✅ ANSWERED
**Approach**:
- Tool execution failures: Log error, return error message to LLM, let it decide next step
- LLM malformed output: Retry once with clarifying prompt, then fail gracefully
- Network errors: Exponential backoff up to 3 retries
- Provide clear error context to both user and LLM

### 5. Performance Considerations ✅ ANSWERED
**Implementation**:
- No caching in initial version (keep it simple)
- Respect TOP_K limit from .env (default: 6)
- Progressive disclosure: Tools can be called multiple times if needed
- Log performance metrics when verbose logging enabled

### 6. Tool Call Logging ✅ ANSWERED
**Implementation**:
- ✅ Verbose logging mode for debugging (configurable via .env LOG_LEVEL)
- ✅ Token usage tracking (log request/response sizes)
- ✅ Query performance metrics (tool execution time, LLM latency)
- ✅ Audit trail: Log all tool calls with timestamp, input, output, status

Log Levels:
- `error`: Only errors
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging information
- `trace`: Very verbose, includes all tool I/O

### 7. Testing Strategy ✅ ANSWERED
**Framework**: Vitest
**Approach**:
- Unit tests: Mock Chroma responses with fixture data
- Integration tests: Test against local Chroma instance (optional, CI skip)
- LLM mocking: Use deterministic mock responses for predictable tests
- Test coverage: Zod schemas, tool parsing, vector adapter, message construction

### 8. Azure OpenAI Specifics ✅ ANSWERED
**Priority**: OpenAI first, Azure OpenAI as secondary
**Implementation**:
- Use standard deployment names (configurable via .env)
- Handle API version via Azure SDK defaults
- Same API key auth pattern as OpenAI
- Document Azure-specific env vars in .env.example

---

## 📊 Implementation Priority & Dependencies

### Critical Path (Must be done in order):
1. **Phase 1** (Scaffolding) → Foundation for everything
2. **Phase 2** (Interfaces) → Required by all implementations
3. **Phase 3** (Vector Store) → Required by tools
4. **Phase 4** (Tools) → Required by runtime
5. **Phase 5** (Tool Adapters) → Required for tool schema emission
6. **Phase 6** (LLM Provider) → Required by runtime
7. **Phase 7** (Runtime) → Core agent logic
8. **Phase 11** (Agent System Prompt) → Required for runtime
9. **Phase 8** (Utils) → Supporting utilities
10. **Phase 9** (CLI) → Entry point
11. **Phase 10** (Docs & Tests) → Quality assurance

### Can be done in parallel:
- **Phase 5** (Tool Adapters) + **Phase 3** (Vector Store) - Independent paths
- **Phase 8** (Utils) - Can develop alongside runtime
- **Phase 10.1** (README) - Can write as you implement
- **Phase 10.2** (Tests) - Write alongside implementation (TDD approach)
- **Phase 11.2 & 11.3** (Examples & Demos) - After core is functional

---

## ✅ Acceptance Criteria Checklist

- [ ] `npm install` completes without errors
- [ ] `npm run build` produces valid JavaScript in `dist/`
- [ ] `npm run start "question"` executes end-to-end
- [ ] Changing PROVIDER in .env switches LLM providers (OpenAI primary)
- [ ] Changing TOOL_FORMAT in .env switches tool schema format
- [ ] Changing CHROMA_COLLECTIONS in .env queries different/multiple collections
- [ ] Multi-collection support: simultaneous querying and result merging
- [ ] All prompts are overrideable via .env (planner, step runner, evaluator, finalizer)
- [ ] Agent system prompt lives in external `AGENT_SYSTEM_PROMPT.md` file
- [ ] Agent system prompt file path is configurable via `AGENT_SYSTEM_PROMPT_PATH` in .env
- [ ] Agent system prompt supports template variable substitution ({{COLLECTIONS}}, {{TOP_K}}, etc.)
- [ ] LOG_LEVEL controls verbosity (error, warn, info, debug, trace)
- [ ] Tools successfully query ingestion metadata from gosu-rag
- [ ] Split nodes are reconstructed correctly by line number
- [ ] Final answers cite file paths and line numbers
- [ ] Agent system prompt prevents hallucination and enforces grounding
- [ ] Error messages are clear and actionable
- [ ] README provides complete setup instructions
- [ ] Unit tests pass without network dependencies (Vitest)
- [ ] Integration tests work with local Chroma instance
- [ ] New vector store can be added by implementing VectorStoreAdapter
- [ ] New tool can be added by implementing Tool interface
- [ ] Example queries demonstrate various use cases
- [ ] Demo scripts are runnable and well-documented

---

## 🚀 Next Steps

**All questions have been answered! Ready to proceed with implementation.**

### Immediate Actions:
1. ✅ gosu-rag metadata schema documented (see Phase 3.1)
2. ✅ Multi-collection strategy defined (simultaneous query + merge)
3. ✅ Logging strategy defined (verbose, configurable levels)
4. ✅ Testing framework selected (Vitest)
5. ✅ Example queries and demos planned (Phase 11.2 & 11.3)
6. ✅ Agent system prompt specified (Phase 11.1)

### Implementation Order:
1. **Phase 1**: Create project scaffold with TypeScript, package.json, configs
2. **Phase 2**: Define Zod schemas and core interfaces
3. **Phase 3**: Implement ChromaAdapter with multi-collection support
4. **Phase 4**: Implement all 4 tools (symbol_search, get_file, regex_search, semantic_search)
5. **Phase 5**: Create OpenAI tool adapter (Anthropic as secondary)
6. **Phase 6**: Build OpenAI LLM client (prioritize this provider)
7. **Phase 7**: Implement Planner → StepRunner → Evaluator → Finalizer
8. **Phase 11**: Generate agent system prompt with anti-hallucination rules
9. **Phase 8**: Build utility functions (messages, errors, logging)
10. **Phase 9**: Create CLI entry point
11. **Phase 10**: Write README, tests, and documentation
12. **Phase 11.2 & 11.3**: Create example queries and demo scripts

### Success Metrics:
- CLI can answer: "How does account validation work?"
- Agent cites actual file paths and line numbers
- Multi-collection querying works seamlessly
- Logging at different verbosity levels works
- Example queries demonstrate best practices
- No hallucination - all answers grounded in actual code



## 📝 Notes

- This implementation follows the "Planner → Step Runner → Evaluator → Finalizer" pattern with single tool calls per turn
- All configuration is externalized to .env for maximum flexibility
- The vector store abstraction allows future support for Pinecone, Weaviate, etc.
- Tool schemas are pluggable to support different LLM providers
- The system is read-only with respect to the ingestion collections
- Structured outputs via Zod ensure type safety and validation throughout
