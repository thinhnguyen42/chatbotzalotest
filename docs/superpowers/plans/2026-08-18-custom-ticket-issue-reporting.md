# Custom Ticket & Issue Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated Ticket generation with custom format (`tk<roomNumber><issueSeq>`, e.g., `tk401001`), user guidance template reply, configurable Admin phone number (`0335395573`), and dual ticket dispatch for both User and Admin.

**Architecture:**
1. `src/config/adminConfig.ts`: Configurable Admin phone number and notification settings.
2. `src/ticket/ticketService.ts`: Ticket code generator (`tk401001`), ticket store, and message formatters.
3. `src/replyEngine.ts` & `src/server.ts`: Integrated to reply with exact user template and dispatch tickets to both User and Admin.

---

### Task 1: Create Admin Config and Ticket Service Modules

**Files:**
- Create: `src/config/adminConfig.ts`
- Create: `src/ticket/ticketService.ts`
- Create: `scripts/testTicketService.ts`

- [ ] **Step 1: Write `src/config/adminConfig.ts`**
- [ ] **Step 2: Write `src/ticket/ticketService.ts` with `tk<room><seq>` generator**
- [ ] **Step 3: Write test script `scripts/testTicketService.ts`**
- [ ] **Step 4: Run test script to verify ticket code generation format**
- [ ] **Step 5: Local commit**

---

### Task 2: Integrate Ticket Generation into Bot Pipeline

**Files:**
- Modify: `src/replyEngine.ts`
- Modify: `src/server.ts`
- Create: `scripts/testTicketPipeline.ts`

- [ ] **Step 1: Update `replyEngine.ts` to output exact issue reporting prompt and generate ticket code**
- [ ] **Step 2: Update `server.ts` to dispatch tickets to both User and Admin (Hotline 0335395573)**
- [ ] **Step 3: Run integration test `scripts/testTicketPipeline.ts`**
- [ ] **Step 4: Run `npx tsc --noEmit` to verify type safety**
- [ ] **Step 5: Local commit**
