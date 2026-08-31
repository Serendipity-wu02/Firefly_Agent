# Firefly-Pet V2 Roadmap (Planning Only)

This document outlines the planned future milestones for V2. No V2 code is implemented in this V1 baseline.

---

## Phase V2.1: Agent Core v2 (Multi-Step Planning & Execution)
- **Goal**: Upgrade `FireflyAgentCore` with multi-step goal decomposition, structured planning loops, and robust tool-chain recovery.
- **Key Deliverables**:
  - ReAct / Plan-and-Solve structured loop.
  - Sub-task checkpointing & state resumption.
  - Token consumption tracking & adaptive message compaction.
  - Dynamic skill loading and execution.

---

## Phase V2.2: Memory v2 (Multi-Tiered Cognitive Architecture)
- **Goal**: Transform lightweight key-value memory into a tiered cognitive memory system.
- **Key Deliverables**:
  - Multi-namespace SQLite storage (`shared_profile`, `daily_life`, `work_tasks`).
  - Local embedding engine (vector similarity search).
  - Confidence threshold filtering ($\ge 0.85$) for fact extraction.
  - Ebbinghaus-inspired memory decay and importance scoring.

---

## Phase V2.3: RAG Knowledge Base (HSR Lore & Specialized Docs)
- **Goal**: Connect Firefly-Pet to offline Honkai: Star Rail knowledge base and external documentation.
- **Key Deliverables**:
  - Offline chunking & indexing for `resources/knowledge/` and `resources/wiki/`.
  - Hybrid BM25 + Vector retrieval.
  - Anti-hallucination citation guardrails preserving in-character tone.
