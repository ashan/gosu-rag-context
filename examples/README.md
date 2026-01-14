# Example Queries and Demo Scripts

This directory contains example scripts demonstrating different usage patterns of the RAG agent system.

## Running Examples

All examples use TypeScript and require the same setup as the main application:

```bash
# Ensure .env is configured
cp ../.env.example ../.env
# Edit .env with your API keys

# Run any example with tsx
npx tsx examples/simple-query.ts
npx tsx examples/complex-query.ts
npx tsx examples/semantic-explore.ts
npx tsx examples/file-analysis.ts
npx tsx examples/batch-queries.ts
```

## Examples

### 1. Simple Query (`simple-query.ts`)
**Purpose**: Demonstrate basic symbol search

**Question**: "What is the AccountEnhancement_ACC class?"

**Strategy**: 
- Single-step query
- symbol_search tool
- Direct answer with citations

**Expected Duration**: ~15 seconds

---

### 2. Complex Query (`complex-query.ts`)
**Purpose**: Multi-step investigation

**Question**: "How does account validation work in the ACC project?"

**Strategy**:
- Multi-step plan creation
- Combines symbol_search, get_file
- Analysis and synthesis
- Comprehensive answer with code examples

**Expected Duration**: ~30-40 seconds

---

### 3. Semantic Explore (`semantic-explore.ts`)
**Purpose**: Exploratory semantic search

**Questions**:
- "Find all database query utilities"
- "What billing-related functionality exists?"
- "Show me examples of custom validation logic"

**Strategy**:
- semantic_search for each query
- Discovers code without knowing exact names
- Multiple iterations

**Expected Duration**: ~60 seconds (3 queries)

---

### 4. File Analysis (`file-analysis.ts`)
**Purpose**: Deep dive into specific files

**Question**: "Show me the structure of AccountEnhancement_ACC.gsx"

**Strategy**:
- Find file with symbol_search
- Retrieve complete file with get_file
- Analyze structure and components

**Expected Duration**: ~20 seconds

---

### 5. Batch Queries (`batch-queries.ts`)
**Purpose**: Process multiple related questions efficiently

**Categories**:
- Account Management (3 questions)
- Database Operations (2 questions)

**Strategy**:
- Reuse LLM and vector store connections
- Process queries sequentially
- Summarized output for batch mode

**Expected Duration**: ~120 seconds (5 queries)

---

## Expected Output Format

Each example will show:

1. **Question** - The user query
2. **Agent Process** - Steps being executed (planner, runner, evaluator)
3. **Tool Calls** - Which tools are called with what parameters
4. **Final Answer** - Comprehensive, cited response

Example output:
```
======================================================================
🤖 RAG Agent Starting
======================================================================
Question: What is the AccountEnhancement_ACC class?

[Agent] Checking vector store connectivity...
[Agent] ✓ Vector store connected

[Agent] Creating execution plan...
[Planner] Created plan with 2 steps

[Step 1] Starting: Find AccountEnhancement_ACC class
[Step 1] Tool call: symbol_search
[Step 1] Tool result received (object)
[Step 1] Step complete after 1 turns
[Step 1] Status: completed

[Evaluator] Decision: finalize - Found the class definition

[Agent] Generating final answer...

======================================================================
✅ RAG Agent Complete
======================================================================

📝 Final Answer:

The AccountEnhancement_ACC class is an enhancement for the Account entity
located in nz/co/acc/account/AccountEnhancement_ACC.gsx (lines 1-200).

[... rest of detailed answer with code citations ...]
```

---

## Customizing Examples

Feel free to modify the questions in these examples to match your specific codebase:

```typescript
// Change the question
const question = "Your custom question here";

// Add custom metadata filters
const answer = await runAgent(llm, vectorStore, question);
```

---

## Troubleshooting Examples

### Import Errors
```bash
# Ensure you've built the project
npm run build

# Or use tsx directly (no build needed)
npx tsx examples/simple-query.ts
```

### ChromaDB Not Connected
```bash
# Start ChromaDB from gosu-rag project
cd ../gosu-chroma-rag
docker compose up -d
```

### API Rate Limits
If you hit OpenAI rate limits, add delays between batch queries:
```typescript
await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
```

---

## Creating Your Own Examples

Template for new examples:

```typescript
import { config } from 'dotenv';
import { OpenAIClient } from '../src/providers/buildLLM.js';
import { ChromaAdapter } from '../src/vectorstores/chroma/chromaAdapter.js';
import { runAgent } from '../src/runtime/agent.js';

config();

async function main() {
  console.log('My Custom Example');
  
  const question = "Your question here";
  
  const llm = new OpenAIClient();
  const vectorStore = new ChromaAdapter();
  await vectorStore.connect();
  
  const answer = await runAgent(llm, vectorStore, question);
  
  console.log(answer);
}

main().catch(console.error);
```

---

**Happy querying! 🚀**
