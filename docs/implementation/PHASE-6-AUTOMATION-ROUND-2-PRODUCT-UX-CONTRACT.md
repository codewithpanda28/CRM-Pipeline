# PHASE 6 — Automation Round 2 Product + UX Contract

| Field | Value |
|-------|-------|
| Status | **DESIGN / PRODUCT / UX CONTRACT ONLY — implementation-ready** |
| Date | 2026-09-06 |
| Depends on | Round 1 engine **verification-green** · Architecture Contract · **ADR-027 Accepted** |
| Explicit non-goals | Implementation code · Round 1 runtime changes · PM/pipeline legacy changes · Voice provider runtime · WhatsApp provider runtime · billing implementation · unrelated modules |

**Primary product goal:** Automation that is powerful for serious businesses and **extremely simple for normal clients**. Technical complexity (JSON, envelopes, queues, workers, schemas, idempotency, payload hashes) stays behind the UI.

**Client mental model (only):**

```text
WHEN → IF → THEN → WAIT → ELSE → APPROVAL
```

---

## 0. Binding product principles

1. **Plain language first** — never force business owners to learn engine vocabulary.  
2. **Progressive disclosure** — Advanced / Execution details / Developer details for power users only.  
3. **Draft ≠ Approve ≠ Execute** — AI and NL never authorize (ADR-027).  
4. **Shared customer context** — Lead / Deal / CustomerParty / Invoice IDs; no WhatsApp or Voice identity silos.  
5. **Domain authority** — Finance/Accounting remain SoR; Automation calls domain services only.  
6. **Voice is not replaced** — adapter UX only; existing Voice Calling stays owned elsewhere.  
7. **Templates & niche packs** — configuration over forked codebases.  
8. **Safety visible** — every action shows Runs automatically / Needs your approval / Not available.  

### Round 1 → Round 2 mapping (UI label → engine)

| Client label | Round 1 under the hood |
|--------------|------------------------|
| WHEN | Trigger (`event_name` + filter) |
| IF / ELSE | Condition / branch steps |
| THEN | Action step (Class A) or gated path |
| WAIT | Delay / wait-for-event |
| APPROVAL | Approval step + `automation_approvals` (Class B) |
| Publish | Immutable `workflow_versions` |
| Activity | `workflow_runs` / steps |
| Technical details | Snapshots, hashes, correlation, attempts |

---

## 1. Information architecture

```text
Automation
├── My Automations          # list, enable/disable, edit, duplicate
├── Templates               # industry + outcome packs
├── Approvals               # inbox for Class B decisions
├── Activity / Runs         # human-readable run timelines
└── Settings                # usage, defaults, connections status (WA/Voice when available)
```

**Nav placement:** Top-level module “Automation” (existing Round 1 module permissions).  
**Do not surface by default:** outbox, BullMQ, payload hash, schema_hash, job names, step_type enums.

**Settings sub-areas (simple):**

| Setting | Audience |
|---------|----------|
| Usage this period | All |
| Default approvers | Admin |
| WhatsApp connection status | Admin (Round 2B) |
| Voice connection status | Admin (Round 2B) |
| Advanced engine flags | Admin only (maps to Round 1 flags; plain labels) |

---

## 2. Screen map

| Screen | Route (suggested) | Primary job |
|--------|-------------------|-------------|
| Automation home | `/automation` | Overview: active count, pending approvals, recent activity, CTA Create |
| My Automations | `/automation/workflows` | List + search + status |
| Guided builder | `/automation/workflows/new` · `…/:id/edit` | WHEN/IF/THEN canvas |
| Describe (AI) | `/automation/workflows/describe` | NL → draft review |
| Template gallery | `/automation/templates` | Discover / preview / install |
| Template customize | `/automation/templates/:id/install` | Few options then draft |
| Approval inbox | `/automation/approvals` | Decide Class B |
| Approval detail | `/automation/approvals/:id` | Exact what is authorized |
| Activity | `/automation/runs` | Business timeline of runs |
| Run detail | `/automation/runs/:id` | Simple progress + optional Advanced |
| Settings | `/automation/settings` | Usage + connections |
| Niche onboarding | `/onboarding/niche` or wizard from Settings | Industry pack suggest |

---

## 3. User journeys (acceptance-shaped)

### Journey 1 — Template path (default for most clients)

1. Open **Templates** → pick “Never miss a new lead”  
2. Preview plain-language “What ThinkAIQ will do”  
3. Customize 2–4 options (salesperson, message, wait time)  
4. **Test** (simulate) → see sample timeline  
5. **Publish** → confirm risk badges  
6. Monitor in **Activity**  
7. If Class B appears → **Approvals** on desktop or mobile  

### Journey 2 — Guided builder

1. **Create** → Guided Builder  
2. Add WHEN block → choose “New lead created”  
3. Add THEN blocks (assign, message, task)  
4. Add WAIT → IF → THEN  
5. Validation panel clears errors in plain English  
6. Save draft → Test → Publish  

### Journey 3 — Describe what you want (AI)

1. Type Hinglish/English business intent  
2. AI returns **draft only** + explanation + risk classes  
3. User edits in builder  
4. Test → Publish  
5. Never auto-publish / auto-approve / execute critical  

### Journey 4 — Manager approval on mobile

1. Push / in-app: “Approval needed: Refund ₹75,000”  
2. Open card → see customer, reason, amount  
3. Approve or Reject with optional comment  
4. Return to work — no JSON  

---

## 4. Simple workflow creation

### Path A — Guided Builder

- Visual blocks with **WHEN / IF / THEN / WAIT / APPROVAL / ELSE** labels only  
- Pickers for CRM entities (leads, deals, invoices) using business names  
- Minimal fields per block; “More options” for rare settings  
- Autosave draft every few seconds + explicit Save  

### Path B — Describe What You Want

```text
Natural language
  → AI draft workflow (graph)
  → Plain-language explanation
  → Validate (schema + Class A/B/C)
  → Show actions + risk badges
  → User review / edit in builder
  → Test / simulate
  → Publish (human)
```

**AI MUST NOT:** auto-publish · auto-approve · execute Class B/C · treat NL as authorization · bypass ADR-027.

**Multilingual input:** Accept Hinglish/English; explanation always in user’s UI locale (default English with Hinglish OK in draft notes).

---

## 5. Visual builder UX

### 5.1 Node categories (client-facing)

| UI category | Purpose | Engine map |
|-------------|---------|------------|
| **WHEN** | Start | Trigger node |
| **IF** | Check condition | Condition |
| **ELSE** | Alternate path | Branch edge `false` / default |
| **THEN** | Do something | Action (A) or opens APPROVAL for B |
| **WAIT** | Pause | Delay / wait-for-event |
| **APPROVAL** | Ask a person | Approval step |

Never show raw `step_type` in the default canvas.

### 5.2 Node UX

- Large title (“New lead created”) + short subtitle (“Starts this automation”)  
- Risk chip on THEN/APPROVAL: **Auto** (A) · **Needs approval** (B) · **Blocked** (C — cannot place)  
- Config sheet (side panel): plain fields, not JSON editors  
- Connection handles: top = in, bottom = out; IF has True/False outs labeled  

### 5.3 Canvas behaviors

| Behavior | Spec |
|----------|------|
| Connections | Drag handle → target; snap; reject cycles that create unreachable loops without WAIT bound |
| Validation | Live + on Publish (see §16) |
| Empty state | “Start with WHEN — what should start this automation?” + Template CTA |
| Duplicate node | Duplicate with new id; copy config; connections not auto-duplicated |
| Delete | Confirm if node has children; rewire or orphan warning |
| Edit | Click node → panel; Esc closes without losing draft (autosave) |
| Undo / redo | Stack ≥ 50 steps for graph edits (not publish) |
| Error indicators | Red border + plain message under node |
| Save draft | Autosave + “Saved” indicator |
| Publish | Primary CTA; disabled until validation green |
| Version display | “Published v3 · Editing draft” badge in header |

### 5.4 Example canvas (client view)

```text
WHEN    New Lead Created
  ↓
THEN    Assign to Salesperson          [Auto]
  ↓
THEN    Send Welcome Message           [Needs approval]* 
  ↓
WAIT    1 hour
  ↓
IF      Lead not contacted
  ↓ true
THEN    Create Follow-up Task          [Auto]
```

\* If message is Class B (customer WhatsApp), UI inserts/requires APPROVAL before send — or shows combined “THEN + approval” card.

---

## 6. Templates

### 6.1 Discovery

- Gallery grid + search (“lead”, “invoice”, “appointment”)  
- Filters: Industry · Outcome · Channel (WhatsApp/Voice/Email when available)  
- Sort: Recommended · Popular · Newest  

### 6.2 Categories (minimum industries)

Real Estate · Agency · Education · Manufacturing/Distribution · Construction · CA/Professional Services · Salon/Clinic/Appointment · Automobile/Workshop · Recruitment · General B2B Sales  

### 6.3 Outcome-oriented titles (not technical)

| Template name | Outcome |
|---------------|---------|
| Never miss a new lead | Assign + welcome + follow-up |
| Follow up on unpaid invoices | Remind → escalate (approval if critical) |
| Convert accepted quote into next step | Invoice / project / notify |
| Remind customers before appointments | Schedule reminders |
| Follow up after a sales call | Voice outcome → CRM → next THEN |

### 6.4 Template lifecycle

| Action | UX |
|--------|-----|
| Preview | Plain “What ThinkAIQ will do” + risk summary |
| Install | Creates **draft** automation (not live) |
| Customize | Short wizard (owners, templates, wait times) |
| Duplicate | Copy draft |
| Disable | Toggle on My Automations (pause triggers) |

Templates are **config packs** over shared engine — not separate products.

---

## 7. Approval experience (ADR-027)

### 7.1 Inbox card (default)

```text
APPROVAL REQUIRED

Refund
₹75,000

Customer
ABC Pvt Ltd

Reason
Customer refund requested

Requested by
Automation: Payment Recovery

Expires in 4h

[View details]   [Approve]   [Reject]
```

### 7.2 Must show (plain)

- Action label (human)  
- Amount / quantity when money  
- Customer / party display name  
- Affected records (invoice #, deal name) as links  
- Reason / comment from requester  
- Important parameters (method, destination — not full JSON)  
- Expiry countdown  
- Requester (automation name + optional user)  

### 7.3 Technical details (collapsed)

- Exact payload snapshot  
- Payload hash  
- Workflow / version / run / step IDs  
- Correlation id  

### 7.4 Safety copy

- Approve button label: **Authorize this action** (not “OK”)  
- Confirm sheet for high amounts: restate amount + customer  
- Reject requires reason (recommended always)  
- Self-approval blocked messaging when policy forbids  
- **Never** treat chat replies or NL as Approve  

### 7.5 Mobile

- Full-width Approve / Reject  
- Sticky action bar  
- Details scroll; amount always visible  

---

## 8. Run / Activity experience

### 8.1 Simple timeline (default)

```text
New Lead Follow-up
✓ Lead received
✓ Salesperson assigned
✓ WhatsApp sent
✓ Follow-up task created
⏳ Waiting 1 hour
```

### 8.2 Failure (simple)

```text
⚠ WhatsApp failed
Retrying… Attempt 2 of 5
[Notify me when fixed]
```

### 8.3 Advanced — Execution details

Step · timestamp · attempt · error message · correlation · Retry · Replay  

**Replay copy:** “Try this step again. This does **not** approve money or critical actions.”

### 8.4 List filters

Running · Waiting · Needs approval · Failed · Completed · Today  

---

## 9. AI explanation UX

Every AI draft includes:

**What ThinkAIQ will do** — numbered plain steps  

Plus callouts:

| Callout | When |
|---------|------|
| Needs your approval | Any Class B |
| Not available | Class C attempted — removed with explanation |
| Missing setup | e.g. WhatsApp not connected |
| Watch for failures | External channel / Voice |

User must expand/confirm explanation before Publish is enabled (checkbox: “I understand what this automation will do”).

---

## 10. Voice integration UX (adapter — do not replace Voice)

### 10.1 THEN action

**Make Voice Call** (or “Start call / Add to campaign”)

Config (plain):

- Recipient (Lead / Customer / Deal contact)  
- Campaign or call type  
- Approved script / agent  
- Business hours  
- Retry if no answer  

Risk: typically **Needs approval** (Class B) for outbound dial / campaign add.

### 10.2 WHEN / IF from Voice outcomes

Client labels:

| UI event | Future canonical (engine) |
|----------|---------------------------|
| Call started | `voice.call.started` |
| Call answered | `voice.call.answered` |
| Call completed | `voice.call.completed` |
| No answer | `voice.call.no_answer` |
| Busy | `voice.call.busy` |
| Interested | `voice.call.interested` |
| Not interested | `voice.call.not_interested` |
| Follow-up required | `voice.call.follow_up_required` |

Timeline language: “Call completed → Customer interested → CRM updated → Next step…”

### 10.3 Connection Settings

“Voice: Connected / Not connected” — never embed SIP credentials in builder.

---

## 11. WhatsApp UX (future native-feeling, no silo)

### THEN — Send WhatsApp

- Recipient (from Lead/CustomerParty)  
- Template or message  
- Attachment  
- Send now / after wait  
- Approval badge when Class B  

### WHEN — WhatsApp reply / message received

Links to Lead · CustomerParty · Deal · Customer 360 — **same IDs**, no parallel WhatsApp contact.

Empty state: “Connect WhatsApp in Settings to use this action.”

---

## 12. CRM + Finance + Documents connected examples

Automation **orchestrates**; Finance/Accounting/Documents APIs own money and books.

| Flow | Client story | Domain notes |
|------|--------------|--------------|
| Deal won chain | Deal Won → Quote → Customer approval → Invoice → Payment tracking | Quote/Invoice via domain services |
| Overdue | Invoice overdue → Staff notify → Approval if critical → WhatsApp/Voice → Escalate | No direct GL writes |
| Quote accepted | Accepted → Invoice → Project/Task → Notify | Documents render via existing pipeline |

UI never offers “edit journal” or “raw SQL” actions.

---

## 13. Niche packs (configuration, not forks)

### Onboarding choice: “What is your business?”

Example **Real Estate** suggests:

- Pipeline stages  
- Custom fields  
- Dashboards  
- Automations (from template set)  
- WhatsApp templates  
- Voice follow-up flows  

User can skip or customize. Packs are **installable config** on the shared ThinkAIQ platform.

Same pattern for Agency, Education, Manufacturing, Construction, CA, Salon/Clinic, Auto workshop, Recruitment, B2B Sales.

---

## 14. User safety (Class A/B/C in the UI)

| Class | Client label | Color/treatment |
|-------|--------------|-----------------|
| A | **Runs automatically** | Neutral/success chip |
| B | **Needs your approval** | Warning chip + APPROVAL node |
| C | **Not available for automation** | Cannot drop; explain why |

**Forbidden UX patterns:**

- Hidden auto-approval  
- Ambiguous “Continue” that authorizes money  
- Interpreting NL/chat as Approve  
- Pre-checked “approve similar next time” that skips ADR-027  

---

## 15. Monetization / usage UX (display only in Round 2)

```text
Automations used
2,450 / 5,000 this month
```

Optional breakdown (simple):

- Automations run  
- Steps completed  
- Messages sent (when WA live)  
- Calls started (when Voice live)  

No billing implementation in Round 2 — hooks only for future metering (align Round 1 counters).

Avoid jargon: “OCU”, “SKU”, “idempotent executions”.

---

## 16. Admin / Advanced mode (progressive disclosure)

| Audience | Sees |
|----------|------|
| Business user | Builder, templates, plain activity, approval cards |
| Admin | + Settings, default approvers, connection status, disable automations |
| Advanced (toggle) | Execution details, retries, payloads, correlation IDs, logs, engine flags |

Default: Advanced **off**.

---

## 17. Responsive UX

| Breakpoint | Priority |
|------------|----------|
| Desktop | Full canvas builder |
| Tablet | Canvas with collapsible palette; panels as sheets |
| Mobile | **Approvals** and **Activity** first-class; builder = “Edit on desktop” or simplified list editor for small edits (enable/disable, rename, wait time) |

Manager must complete Approve/Reject in ≤ 3 taps on mobile.

---

## 18. Error prevention (before Publish)

Validate and show **human** messages:

| Check | Example message |
|-------|-----------------|
| Missing WHEN | “Add a starting event — when should this automation begin?” |
| Missing config | “Choose which salesperson should receive new leads.” |
| Invalid connection | “This step isn’t connected to anything yet.” |
| Unreachable node | “This step can never run — connect it or remove it.” |
| Conflicting branches | “Both paths can’t be true at once — check your IF conditions.” |
| Unsupported / Class C | “Deleting all customer data can’t be automated.” |
| Class B without approval | “Sending this customer message needs an approval step.” |
| Invalid schedule / wait | “Wait time must be at least 1 minute.” |
| Channel not connected | “WhatsApp message can’t be sent because WhatsApp isn’t connected.” |

Never show raw `INVALID_ACTION_CONFIG` to business users (map codes → copy).

---

## 19. Key product flows (complete UX)

| ID | Flow | Primary screens |
|----|------|-----------------|
| **A** | New Lead → assign → message → task | Template or Guided · Activity |
| **B** | Invoice overdue → remind → approval → communicate → escalate | Template · Approvals · Activity |
| **C** | Deal Won → quote/invoice → approval → customer message | Guided · Finance deep links |
| **D** | Voice completed → CRM outcome → next THEN | WHEN Voice · THEN CRM (2B) |
| **E** | WhatsApp reply → CRM update → continue | WHEN WA · Customer 360 (2B) |
| **F** | AI describe → draft → review → test → publish | Describe · Builder · Test |

---

## 20. Round 2 implementation split

### ROUND 2A — UX foundation (no AI runtime, no Voice/WA providers)

- Automation IA + routing  
- My Automations list  
- Guided builder (WHEN/IF/THEN/WAIT/APPROVAL/ELSE)  
- Draft / save / publish UX on Round 1 APIs  
- Template gallery + install → draft  
- Approval inbox + mobile-friendly detail  
- Activity / run simple timeline + Advanced drawer  
- Publish validation copy  
- Class A/B/C chips  
- Usage display (read Round 1 counters)  
- Settings shell (flags behind Advanced)  

**Does not:** AI provider calls · Voice/WhatsApp adapters · niche pack installer deep CRM mutations beyond templates  

### ROUND 2B — AI + channels + packs

- AI draft + explanation + risk classification (draft only)  
- Simulate / test experience  
- Voice adapter UX + event WHEN labels (integrate existing Voice — **do not replace**)  
- WhatsApp adapter UX + Customer 360 linkage  
- Shared conversation/customer context  
- Niche pack onboarding  
- Richer usage UI (channel hooks)  

### Final verification (after 2A+2B)

Single acceptance pass against §21 — not micro-phases.

---

## 21. Final product acceptance criteria

A **normal business owner** can:

1. Choose a template  
2. Change a few options  
3. Understand what will happen (plain explanation)  
4. Test / simulate it  
5. Publish it  
6. Monitor it in Activity  
7. Approve critical actions (including on mobile)  
8. Understand and act on failures without technical knowledge  

A **power user** can open Execution details (retries, payloads, correlation).

Automation must feel: **simple · fast · safe · understandable · connected** to CRM/Finance/(future) Voice/WhatsApp · useful across industries.

### Hard fail acceptance checks

| Check | Fail if |
|-------|---------|
| ADR-027 | NL/AI/auto-approve can execute Class B |
| Simplicity | Default UI requires JSON or “event envelope” knowledge |
| Voice | Product replaces or forks Voice Calling |
| WhatsApp | Separate customer identity silo |
| Finance | UI bypasses domain services for money |
| Legacy | Round 2 silently breaks PM/pipeline islands |

---

## 22. Permissions ↔ UX (Round 1 keys)

| Permission | UX capability |
|------------|---------------|
| `automation:workflows:view` | My Automations, Activity read |
| `automation:workflows:edit` | Builder, drafts, templates install |
| `automation:workflows:publish` | Publish |
| `automation:runs:view` | Activity |
| `automation:runs:replay` | Advanced Replay |
| `automation:approvals:view` | Inbox |
| `automation:approvals:decide` | Approve / Reject |
| `automation:admin` | Settings, Advanced flags |

---

## 23. Document control

| Item | Value |
|------|-------|
| Next artifact | Round 2A implementation plan (only after this contract accepted) |
| Does not modify | Round 1 runtime · ADR-027 · PM/pipeline legacy |
| Supersedes for UX | Informal AUTOMATION_ENGINE.md UX sketches where they conflict with client-first IA |

**DESIGN / PRODUCT / UX ONLY — NO IMPLEMENTATION IN THIS ARTIFACT.**
