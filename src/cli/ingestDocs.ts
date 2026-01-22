#!/usr/bin/env node
/**
 * CLI wrapper for PDF documentation ingestion (Loose Coupling Mode)
 * Exectutes chroma-rag-docs from sibling directory
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Load environment from consolidated .env
dotenv.config();

async function main() {
    console.log('📚 PDF Documentation Ingestion Pipeline (Wrapper)\n');

    // Assume sibling directory structure
    const targetDir = path.resolve('../chroma-rag-docs');

    if (!fs.existsSync(targetDir)) {
        console.error(`❌ Could not find chroma-rag-docs at: ${targetDir}`);
        console.error('   Please ensure the project is checked out as a sibling directory.');
        process.exit(1);
    }

    // Ensure cache directory exists in THIS project
    const cacheDir = path.resolve('.cache/docs');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Construct env with overrides
    const env = {
        ...process.env,
        SOURCE_PATH: path.resolve(process.env.DOCS_SOURCE_PATH || './docs'),
        CHROMA_COLLECTION: process.env.DOCS_COLLECTION || 'docs',
        RAG_CACHE_PATH: path.join(cacheDir, '.rag-cache.json'),
        INGESTION_DB_PATH: path.join(cacheDir, 'ingestion.db'),
        // Force color output
        FORCE_COLOR: '1'
    };

    console.log(`📁 Source: ${env.SOURCE_PATH}`);
    console.log(`📦 Collection: ${env.CHROMA_COLLECTION}`);
    console.log(`Working Dir: ${targetDir}\n`);

    // Spawn the ingestion process in the sibling directory
    const child = spawn('npm', ['run', 'ingest'], {
        cwd: targetDir,
        env: env,
        stdio: 'inherit'
    });

    child.on('close', (code) => {
        if (code === 0) {
            console.log('\n✅ PDF documentation ingestion complete');
        } else {
            console.error(`\n❌ Ingestion failed with code ${code}`);
            process.exit(code || 1);
        }
    });

    child.on('error', (err) => {
        console.error('❌ Failed to start subprocess:', err);
    });
}

main();
