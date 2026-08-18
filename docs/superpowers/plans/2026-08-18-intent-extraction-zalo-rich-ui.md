# Step 2: Intent & Entity Extraction + Zalo Rich UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build structured intent/entity extraction engine (`src/intentEngine.ts`) and Zalo OpenAPI Quick Reply buttons messaging in `src/zaloClient.ts` to provide rich UI buttons and automated ticket dispatch.

**Architecture:**
1. `src/intentEngine.ts`: Analyzes user messages, extracts intents (`EMERGENCY`, `REPORT_ISSUE`, `NOISE_COMPLAINT`, `BILLING`, `GENERAL_FAQ`), entities (`roomNumber`, `deviceType`, `urgencyLevel`), and generates appropriate Quick Reply buttons.
2. `src/zaloClient.ts`: Extends Zalo OpenAPI client with `sendQuickReplies(userId, text, buttons)` for interactive button templates.
3. `src/replyEngine.ts` & `src/server.ts`: Integrates structured ticket dispatch to Admin and dynamic quick reply button attachments.

---

### Task 1: Create Intent & Entity Extraction Engine (`src/intentEngine.ts`)

**Files:**
- Create: `src/intentEngine.ts`
- Create: `scripts/testIntentEngine.ts`

- [ ] **Step 1: Write `src/intentEngine.ts` with regex and pattern-based entity extractor**
- [ ] **Step 2: Write test script `scripts/testIntentEngine.ts`**
- [ ] **Step 3: Run test script to verify intent classification and entity parsing**
- [ ] **Step 4: Local commit**

---

### Task 2: Extend Zalo Client with Quick Reply Buttons (`src/zaloClient.ts`)

**Files:**
- Modify: `src/zaloClient.ts`
- Create: `scripts/testQuickReplies.ts`

- [ ] **Step 1: Implement `sendQuickReplies` in `src/zaloClient.ts`**
- [ ] **Step 2: Write verification test script `scripts/testQuickReplies.ts`**
- [ ] **Step 3: Run test script to verify Zalo payload construction**
- [ ] **Step 4: Local commit**

---

### Task 3: Integrate Intent Engine & Rich UI into Bot Pipeline

**Files:**
- Modify: `src/replyEngine.ts`
- Modify: `src/server.ts`
- Create: `scripts/testStep2Pipeline.ts`

- [ ] **Step 1: Update `replyEngine.ts` to attach Quick Reply recommendations**
- [ ] **Step 2: Update `server.ts` to use structured ticket notification format for Admin**
- [ ] **Step 3: Run full integration test `scripts/testStep2Pipeline.ts`**
- [ ] **Step 4: Run `npx tsc --noEmit` to verify type safety**
- [ ] **Step 5: Local commit**
