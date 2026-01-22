# Troubleshooting Guide

## Ingestion Issues

### 1. `sh: ts-node: command not found`
This error occurs when the sibling project (`gosu-chroma-rag`) is missing dependencies or the `ts-node` executable is not found.
**Status:** Fixed in the latest update (switched to `tsx` and installed dependencies).
**Manual Fix:**
```bash
cd ../gosu-chroma-rag
npm install
```

### 2. `Error: No native build was found for platform=...`
This error indicates that the `tree-sitter` native bindings (or `better-sqlite3`) are missing or compiled for a different Node.js version.
**Cause:** Node version mismatch (e.g. running `npm install` on Node 25 but running script on Node 20).
**Fix:**
Run this in the directory throwing the error (`gosu-chroma-rag`):
```bash
cd ../gosu-chroma-rag
npm rebuild
# OR for a clean slate:
rm -rf node_modules package-lock.json && npm install
```
**Requirement:** Ensure you are using **Node 20 (LTS)**.

### 3. `TypeError: Cannot read properties of undefined (reading 'length')` inside `tree-sitter`
**Status:** Fixed. We upgraded `gosu-chroma-rag` to use `tree-sitter` ^0.25.0 to match the parser grammar. Run `npm install` in `gosu-chroma-rag` to apply.

## Infrastructure

### Connection Refused
If `npm run stats` or ingestion fails to connect:
```bash
docker compose up -d
```
Check if `chroma_data/` folder is populated to verify persistence.
