# Memory and Retrieval Blueprint

This blueprint translates the efficiency idea into a practical ShreAI design:
store facts structurally, retrieve the minimum useful context, compress aggressively, and route work to the smallest capable agent.

## Core Principles

- do not treat memory as a single blob
- store the same fact in multiple useful forms when it helps retrieval
- retrieve small, relevant slices before expanding context
- keep raw source, summary, and embedding forms separate
- route tasks to the smallest agent or tool that can finish the job

## Memory Layer

The memory layer should store information as structured records, not just free-form text.

Suggested fields:

- id
- title
- raw source
- compressed summary
- tags
- keywords
- timestamp
- workspace or tenant
- related ids
- embedding vector
- access scope

Useful storage patterns:

- relational rows for canonical data
- vector index for semantic recall
- linked references for related facts
- timestamped history for change tracking

## Retrieval Layer

Retrieval should behave like a probe, not a dump.

Pattern:

1. ask a narrow question
2. retrieve the smallest relevant set
3. expand only if the task needs more context
4. repeat if the answer is still incomplete

Rules:

- prefer top-k relevant records over full-document context
- use keyword, vector, and structured lookups together when practical
- cache high-value results when the same task pattern repeats
- do not retrieve sensitive data unless the task scope allows it

## Context Compression

Every important item can exist in more than one representation.

Recommended forms:

- raw source
- structured record
- short summary
- semantic embedding

Rules:

- use the smallest representation that fits the task
- prune duplicated text before model calls
- merge overlapping facts when summarizing
- keep compression reversible when possible

## Agent Routing Model

Route work to the agent that can do the job with the smallest useful context.

Example roles:

- retrieval agent: finds facts
- reasoning agent: synthesizes answers
- execution agent: performs allowed actions
- memory agent: maintains structured facts and summaries
- audit agent: checks drift and unsupported claims

Routing rules:

- do not send every task to a generalist first
- prefer specialist agents for narrow work
- hand off only the summary the next role needs
- keep the chain short when possible

## Practical Data Shape

```json
{
  "id": "fact_123",
  "title": "QA deploy target",
  "raw_source": "full source text or record",
  "compressed_summary": "QA deploy uses DEPLOY_HOOK_URL_QA or SSH fallback",
  "tags": ["qa", "deploy", "ops"],
  "keywords": ["qa deploy", "hook", "ssh"],
  "timestamp": "2026-04-30T12:00:00Z",
  "workspace": "shre-chat",
  "related_ids": ["fact_124"],
  "access_scope": "ops",
  "embedding_vector": "[...]" 
}
```

## Operational Rules

- keep memory records versioned
- link important facts back to the source doc or system of record
- update the summary when the raw source changes materially
- use the audit agent to catch stale or contradictory memory

## Rule

If a task can be solved with a smaller memory slice, use the smaller slice first.
