import { Command } from 'commander';
import { QueryEngine } from '../query/QueryEngine';
import * as dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
    .name('rag-query')
    .description('Query the consolidated RAG knowledge base')
    .argument('<query>', 'Question to ask')
    .option('-k, --top-k <number>', 'Number of results to retrieve', '5')
    .option('--no-code', 'Exclude code results')
    .option('--no-docs', 'Exclude documentation results')
    .action(async (query: string, options: { topK: string, code: boolean, docs: boolean }) => {
        try {
            const engine = new QueryEngine();
            const result = await engine.query(query, {
                topK: parseInt(options.topK),
                includeCode: options.code,
                includeDocs: options.docs
            });

            console.log('\n==================================================');
            console.log('🤖 Answer:');
            console.log('==================================================\n');
            console.log(result.answer);
            console.log('\n==================================================');
            console.log('📚 Sources:');
            console.log('==================================================');

            result.results.forEach((res: any, i: number) => {
                const type = res.collection === 'code' ? 'Code' : 'Doc';
                const source = res.metadata.relativePath || res.metadata.source;
                const location = res.metadata.startLine ? `:${res.metadata.startLine}` : (res.metadata.page ? ` (Page ${res.metadata.page})` : '');
                console.log(`${i + 1}. [${type}] ${source}${location} (Score: ${res.score.toFixed(4)})`);
            });
            console.log('');

        } catch (error) {
            console.error('Query failed:', error);
            process.exit(1);
        }
    });

program.parse();
