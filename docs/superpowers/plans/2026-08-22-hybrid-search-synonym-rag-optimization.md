# Step 3: Hybrid Search & Vietnamese Synonym/Abbreviation RAG Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Vietnamese Synonym & Abbreviation Normalizer (`src/utils/synonymUtils.ts`), BM25 keyword search module (`src/rag/bm25Search.ts`), and integrate Hybrid Scoring into `src/rag/ragEngine.ts` to achieve >95% RAG retrieval precision.

**Architecture:**
1. `src/utils/synonymUtils.ts`: Expands domain-specific Vietnamese abbreviations (e.g., `đh` -> `điều hòa`, `pccc` -> `phòng cháy chữa cháy`, `p401` -> `phòng 401`).
2. `src/rag/bm25Search.ts`: BM25 algorithm indexing Knowledge Base chunks for TF-IDF keyword matching.
3. `src/rag/ragEngine.ts`: Hybrid scoring combiner ($\text{Score}_{\text{final}} = 0.4 \times \text{Score}_{\text{BM25}} + 0.6 \times \text{Score}_{\text{Vector}}$) integrated with synonyms expansion.

---

### Task 1: Create Vietnamese Synonym & Abbreviation Normalizer (`src/utils/synonymUtils.ts`)

**Files:**
- Create: `src/utils/synonymUtils.ts`
- Create: `scripts/testSynonyms.ts`

- [ ] **Step 1: Write `src/utils/synonymUtils.ts` with Vietnamese domain synonym expansion**
- [ ] **Step 2: Write test script `scripts/testSynonyms.ts`**
- [ ] **Step 3: Run test script to verify abbreviation expansion**
- [ ] **Step 4: Local commit**

---

### Task 2: Create BM25 Keyword Search Module (`src/rag/bm25Search.ts`)

**Files:**
- Create: `src/rag/bm25Search.ts`
- Create: `scripts/testBm25.ts`

- [ ] **Step 1: Write `src/rag/bm25Search.ts` with inverted index and BM25 scoring**
- [ ] **Step 2: Write test script `scripts/testBm25.ts`**
- [ ] **Step 3: Run test script to verify BM25 keyword retrieval**
- [ ] **Step 4: Local commit**

---

### Task 3: Integrate Hybrid Search into RAG Engine (`src/rag/ragEngine.ts`)

**Files:**
- Modify: `src/rag/ragEngine.ts`
- Create: `scripts/testHybridRAG.ts`

- [ ] **Step 1: Update `ragEngine.ts` to expand synonyms before search and calculate hybrid scores**
- [ ] **Step 2: Run integration test `scripts/testHybridRAG.ts`**
- [ ] **Step 3: Run `npx tsc --noEmit` to verify type safety**
- [ ] **Step 4: Local commit**
