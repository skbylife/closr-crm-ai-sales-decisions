# Closr: Self-Hosted AI CRM for Complex B2B Sales

**Read the customer. See the deal. Decide the next move.**

[Official website](https://www.closr.ing) · [简体中文](README.zh-CN.md) · [Self-hosting](SELF_HOSTING.md) · [License](LICENSE)

Closr is a self-hosted AI CRM for complex B2B sales, bringing B2B sales intelligence and deal intelligence into the team’s daily workspace. Its Sales Judgment workflow connects customer conversations and account history with BABEL-powered stakeholder analysis, Strategic Plays that turn judgment into actionable sales playbooks, and RFP bid/no-bid review—so teams can trace decisions to evidence and agree on the next move.

Use it to examine **what changed, what evidence is missing, who matters to the decision, and what to validate next**—then organize that judgment into a strategic play with steps, owners, and follow-up.

The application, BABEL engine, prompts, strategy implementation, and readable general-knowledge corpus are available in this repository under a **source-available license**. This is the full source distribution, replacing the earlier limited Community preview.

## Why Closr

Complex B2B deals involve more than a stage and a close date. A customer may keep replying while the budget owner remains absent. A request for references may signal interest, or a proof gap. A new procurement stakeholder may change the path to a decision.

Closr brings those signals into an account workspace so the team can compare the interpretation with its sources, identify uncertainty, and agree on the next move. AI output is a hypothesis to review, not a claim to know a customer's private thoughts or a guarantee of a sale.

## Who it is for

- **Account executives and account managers** navigating complex, multi-stakeholder sales, renewals, and expansion.
- **Sales leaders and solution teams** reviewing deal risks, stakeholder coverage, required proof, and tender decisions together.
- **Founders, RevOps, and technical teams** who want to inspect, adapt, and operate their own CRM and sales decision workflow.

## What you can do

### Decode customer communication with BABEL

Analyze customer emails, meeting notes, call transcripts, chat text, and authorized external context for intent signals, urgency, risks, opportunities, and possible responses. Use the original communication and account context to challenge the interpretation and decide what to ask next.

### Build stakeholder profiles and account memory

Keep contacts, roles, relationships, interactions, and account history together. BABEL's profile workflow uses communication history to suggest decision styles, communication preferences, risks, and engagement approaches, with evidence and confidence fields. Profiles and cultural context are working hypotheses for human review, not psychological diagnoses or facts about an individual.

### Review account and deal judgment

The judgment layer organizes health, momentum, supporting and conflicting evidence, uncertainty, evidence gaps, and next moves. Source provenance and human feedback help the team revisit why a judgment changed rather than relying only on a score or generated summary.

### Turn judgment into Strategic Plays — 谋局

For a team unsure how to advance a deal, turn stakeholder understanding into a step-by-step path: who to engage, what to validate, what proof to prepare, and how to respond when the situation changes. Create an execution path connecting customer pain, solution fit, required proof, decision criteria, stakeholder relationships, and timing. Plays bring assumptions, steps, owners, expected signals, and fallback actions into a plan the team can review and update as new evidence arrives.

### Work through RFPs and tender decisions

Organize tender requirements, documents, competitors, and milestones alongside account and opportunity context. Review AI-assisted bid/no-bid judgments and recommendations, then connect the RFP to strategic plays and follow-up work. Estimates are decision inputs, not validated predictions of winning a bid.

### Keep everyday CRM work connected

Manage accounts, contacts, opportunities, pipeline, tasks, and attachments. Record activity, outcomes, and human corrections so the next account review has context from the work already done.

```text
Customer communication + CRM records + RFP context
                         ↓
          BABEL Decode + stakeholder/account memory
                         ↓
         Evidence, contradictions, and missing proof
                         ↓
            Reviewable account/deal judgment
                         ↓
           Strategic Play → tasks → outcome feedback
```

## BABEL and the included knowledge

BABEL's [implementation and prompts](src/lib/babel-engine/) are included, together with the [strategic-play engine](src/lib/strategic-play-engine.ts) and [judgment engine](src/lib/engine/). You do not need access to a separately hosted private Closr Engine to run this source.

The [readable knowledge corpus](data/knowledge/README.md) contains **58 entries**: 52 methodology notes and six cultural profiles. Eight general case entries also populate the strategy-case table. Records include provenance, content hashes, and licensing context. They are repository-authored summaries and prompt material; attribution to a framework does not grant rights to its authors' books or proprietary datasets.

PostgreSQL **pgvector** supports vector retrieval. The default import requires no model credentials and supports keyword retrieval; operators can explicitly rebuild compatible 1536-dimensional embeddings with their own provider. No production vector export or complete production knowledge database is claimed. The historical external strategy dataset missing from GitHub is documented in the corpus guide.

## Self-host Closr

The default stack uses **PostgreSQL + pgvector**, application-owned accounts, sessions and MFA, and a Docker volume for private attachments. **No Supabase account or service is required.** Supabase remains an optional legacy backend.

Install Git, Docker with Compose v2, and Node.js 22. For a corporate TLS proxy, follow the alternative build command in the self-hosting guide before starting. For a direct connection:

```sh
git clone https://github.com/skbylife/closr-crm-ai-sales-decisions.git
cd closr-crm-ai-sales-decisions
node scripts/native-init.mjs
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up --build -d
```

Open `http://localhost:3000/setup` to create your workspace and first owner. Read the **[self-hosting guide](SELF_HOSTING.md)** for configuration, backups, recovery, migrations, and deployment boundaries.

AI features require an operator-configured model provider. The default Compose configuration disables AI and makes no model calls during knowledge import. No API keys or hosted service access are supplied. Review your provider's data handling before sending customer information.

## Architecture and release scope

| Layer | Included implementation |
|---|---|
| Web workspace | Next.js App Router, React, TypeScript, Tailwind CSS |
| Sales judgment | BABEL Decode and profiles, evidence/provenance, judgment, strategic plays, RFP workflows |
| Data and identity | PostgreSQL + pgvector, organization-scoped access controls, native accounts/sessions/MFA |
| Files | Private local-volume storage with authenticated access |
| Model integration | Configurable server-side model calls and optional embedding generation |

See [release notes](RELEASE_NOTES.md) for recorded build, test, fresh-database and browser validation evidence. This does not establish model accuracy, every external integration, or compatibility with an existing production database. Follow the guide’s model-free acceptance check on your installation.

The repository excludes private Git history, production configuration, credentials, customer databases, private embeddings, and internal customer evaluation data. The official website demonstration is a separate artifact; this repository installs the normal authenticated, editable application. The generic knowledge corpus is included separately. Supply only data you are authorized to use.

## Feedback

Report reproducible problems or share workflow feedback in [GitHub Issues](https://github.com/skbylife/closr-crm-ai-sales-decisions/issues). Include the steps, expected and actual behavior, and deployment versions; remove credentials and customer information from logs and screenshots.

## License

Copyright 2026 Zhaocheng Liu. The [Closr Source-Available License](LICENSE) permits personal use, modification, and company-internal self-hosting, including internal commercial use.

It prohibits selling the software or software licenses, and paid third-party hosted, managed, SaaS, or white-label access—including subscriptions—unless separately licensed by the copyright holder. Free redistribution and the independent installation, support, and consulting services in Section 3 remain permitted. There is no automatic future conversion to an unrestricted license.

This is **source-available, not OSI-approved open source**. The included original Engine/BABEL/prompt/strategy source and general knowledge are covered; third-party materials retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the full license terms.
