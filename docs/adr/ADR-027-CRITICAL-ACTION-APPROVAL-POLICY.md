# ADR-027 — Critical Action Approval Policy

| Field | Value |
|-------|-------|
| Status | **Accepted** |
| Date | 2026-09-05 |
| Relates to | ADR-004 (automation execution), ADR-015 (queue ≠ SoR), ADR-019 (outbox), ADR-021 (billing worlds), Phase 5 Automation (deferred) |
| Scope | Human approval gates for financially material, externally consequential, destructive, or privileged actions |

---

## 1. Context

ThinkAIQ will execute money-adjacent, external, destructive, and privileged actions via APIs, workers, and (later) Automation. AI and natural-language workflow drafting make it easy to **accidentally treat intent as authorization**.

Portal/project `approval_requests` (client sign-off) are **not** this policy. This ADR governs **critical action** execution gates (including future Automation HITL).

---

## 2. Decision

**Any financially material, externally consequential, destructive, or privileged action MUST pass an approval gate before execution.**

### In-scope examples (non-exhaustive)

- Payments and refunds  
- High-value discounts  
- Financial adjustments / GL-affecting corrections where policy requires  
- Issuing or cancelling critical financial documents where policy requires  
- Destructive data actions (purge, hard-delete, bulk overwrite)  
- Important external communications (customer-facing money/status notices, webhooks with irreversible effects)  
- Privileged configuration changes (entitlements, billing config, security/MFA policy, job kill switches)

### Required flow

```
Draft → Approval Required → Authorized Approval → Execute
```

| Decision state | Effect |
|----------------|--------|
| Pending / missing | **MUST NOT** execute |
| Rejected | **MUST NOT** execute |
| Expired | **MUST NOT** execute |
| Revoked | **MUST NOT** execute |
| Authorized (valid, non-expired, non-revoked) | May execute **exactly** the approved payload |

### Non-inference rule (hard)

**Automation, workers, APIs, and AI MUST NOT infer approval from:**

- Natural-language wording  
- Chat / agent “intent” or context  
- Prior similar approvals  
- Draft workflow content  
- AI recommendations or prepared payloads  

AI may **recommend or prepare** an action. AI **MUST NOT** bypass this policy or mark an action approved.

### Audit record (required per approval)

Every approval decision MUST record at least:

| Field | Purpose |
|-------|---------|
| Workflow / version | Which definition was in force |
| Run / step | Which execution checkpoint |
| Requested action | Canonical action type |
| Requester | Who/what requested |
| Approver | Who authorized (human identity) |
| Timestamp | Decision time (UTC) |
| Decision | approve / reject / revoke / expire |
| Reason / comment | Where applicable |
| Exact payload / action snapshot | Immutable copy of what was authorized |
| Audit trail | Append-only linkage for later review |

The **system of record** for approvals and run state is **PostgreSQL** (not Redis/BullMQ, not model context). See ADR-015.

### Payload binding

Execution MUST bind to the **approved snapshot**. Materially changed payloads require a **new** approval. Idempotency keys apply to the approved action, not to “whatever the step currently computes.”

---

## 3. Consequences

- Critical paths gain latency (human-in-the-loop) by design.  
- Automation upgrade (Phase 5 deferred) MUST implement durable approval steps before enabling money/external critical actions.  
- Existing direct Finance APIs remain user-session authorized; product policy may still require explicit approval steps for selected high-risk operations as they are introduced.  
- Agents and codegen MUST NOT add “auto-approve” shortcuts, silent execute-on-draft, or NL-as-approval.

---

## 4. Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Trust AI / NL intent as approval | Unsafe; non-auditable; bypasses human accountability |
| Queue message = approved | BullMQ is not SoR; lease ≠ authorization |
| Reuse portal `approval_requests` only | Wrong domain (client portal vs operator HITL) |
| Post-hoc audit without pre-gate | Too late for irreversible money/external effects |

---

## 5. Status relative to Automation

**Automation remains NOT TOUCHED until product implementation of this policy is designed and built.** This ADR is binding for that work and for any interim critical-action gates.
