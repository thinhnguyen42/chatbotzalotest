# Slot Filling & Strict Guardrail Ticket Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 2-step Slot Filling issue reporting flow: Slot Filling question when device is unspecified, and exact 🎫 Ticket Ticket generation when specific device is mentioned, enforcing strict end-user guardrails.

**Architecture:**
1. `src/intentEngine.ts`: Refines device pattern detection. Returns `deviceType = undefined` for general requests ("báo hỏng", "hỏng đồ", "gọi thợ").
2. `src/ticket/ticketService.ts`: Exports `GENERAL_SLOT_FILLING_REPLY` and user-facing ticket template with 🎫 icon.
3. `src/replyEngine.ts`: Handles Slot Filling logic (NO ticket created if `deviceType` is missing; Ticket created ONLY when `deviceType` is present).
4. `src/server.ts`: Enforces strict guardrails (sends ONLY user ticket format to user chat; sends admin ticket notification silently in background via `notifyAdmin`).

---

### Task 1: Refine Intent & Device Detection (`src/intentEngine.ts`)

**Files:**
- Modify: `src/intentEngine.ts`
- Modify: `scripts/testIntentEngine.ts`

- [ ] **Step 1: Ensure general phrases ("báo hỏng", "gọi thợ", "hỏng đồ") do NOT set `deviceType`**
- [ ] **Step 2: Add specific device patterns ("bóng đèn", "công tắc", "vòi nước", "bồn cầu", "ổ khóa", "tủ lạnh", "máy giặt", "máy lạnh", "điều hòa")**
- [ ] **Step 3: Run test script `scripts/testIntentEngine.ts` to verify device extraction vs general phrase parsing**
- [ ] **Step 4: Local commit**

---

### Task 2: Implement 2-Step Slot Filling & Ticket Flow (`src/ticket/ticketService.ts` & `src/replyEngine.ts`)

**Files:**
- Modify: `src/ticket/ticketService.ts`
- Modify: `src/replyEngine.ts`
- Modify: `scripts/testTicketService.ts`

- [ ] **Step 1: Update `ticketService.ts` with `GENERAL_SLOT_FILLING_REPLY` and 🎫 ticket format**
- [ ] **Step 2: Update `replyEngine.ts` slot filling conditional logic**
- [ ] **Step 3: Run test script `scripts/testTicketService.ts`**
- [ ] **Step 4: Local commit**

---

### Task 3: Enforce Strict Guardrails in `src/server.ts` & Verification

**Files:**
- Modify: `src/server.ts`
- Modify: `scripts/testTicketPipeline.ts`

- [ ] **Step 1: Update `server.ts` to separate end-user ticket response from silent admin notification**
- [ ] **Step 2: Run integration test `scripts/testTicketPipeline.ts` to verify general vs specific issue cases**
- [ ] **Step 3: Run `npx tsc --noEmit` to verify type safety**
- [ ] **Step 4: Local commit**
