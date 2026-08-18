# Multi-turn Conversation Memory & LLM Fallback Implementation Plan

**Goal:** Implement multi-turn conversation memory (Session Store) and LLM Generative RAG Fallback with Gemini 1.5/2.0 Flash (Primary) and Groq Llama 3.1 (Backup) for Zalo OA Chatbot.

**Architecture:** 
1. `src/memory/sessionMemory.ts`: Manages session state per Zalo `userId` (stores room number, user name, top 10 chat messages, and handles TTL expiration).
2. `src/llm/llmService.ts`: Generates natural persona responses using RAG context chunks + chat history, failing over from Gemini API to Groq API on 429/errors.
3. `src/replyEngine.ts` & `src/rag/ragEngine.ts`: Integrated to pass `userId`, auto-save extracted room numbers to session, and invoke LLM synthesis when local microservices don't match.

**Tech Stack:** TypeScript, Node.js, Axios, dotenv, Gemini API REST, Groq API REST.

---

### Task 1: Create Session Memory Module (`src/memory/sessionMemory.ts`)

**Files:**
- Create: `src/memory/sessionMemory.ts`
- Create: `scripts/testMemory.ts`

---

### Task 2: Create LLM Fallback Service (`src/llm/llmService.ts`)

**Files:**
- Create: `src/llm/llmService.ts`
- Create: `scripts/testLlmService.ts`

---

### Task 3: Integrate Memory and LLM Fallback into Bot Engines

**Files:**
- Modify: `src/rag/ragEngine.ts`
- Modify: `src/replyEngine.ts`
- Modify: `src/server.ts`
- Create: `scripts/testFullPipeline.ts`
