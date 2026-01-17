# PRD: Sync for Evals

## Overview

Add a personal evaluation system to OpenCode Sync that lets users export their coding sessions from OpenCode and Claude Code as eval datasets. Users can mark sessions as eval-ready, export in multiple formats optimized for popular eval frameworks, and get guided instructions to run evals locally with one command.

This feature builds on the existing session sync infrastructure and adds a streamlined path from captured session data to actionable model evaluation.

## Background

OpenCode Sync currently captures and stores coding sessions from both OpenCode CLI and Claude Code. Sessions include full conversation history with prompts, responses, tool calls, and results. Users can search, export, and share these sessions.

Recent research from Letta demonstrates that filesystem-based retrieval (plain text files with basic search tools) outperforms specialized memory tools on retrieval benchmarks. This suggests that offering both structured JSONL and plain text file exports gives users flexibility to test which format works best for their models.

The eval ecosystem has matured with tools like DeepEval, OpenAI Evals, and Promptfoo that accept standardized formats and require minimal setup. Users can go from export to results dashboard in under five minutes.

## Goals

1. Let users curate high-quality sessions as evaluation test cases
2. Export in formats compatible with DeepEval, OpenAI Evals, and filesystem-based retrieval
3. Provide zero-friction path to running evals with copy-paste commands
4. Include all necessary documentation in the export itself

## Non-goals

1. Running evals server-side (users run locally)
2. Building a custom eval framework
3. Storing eval results in OpenCode Sync (future consideration)
4. Payment or monetization features

---

## Feature specifications

### 1. Session qualification

#### Mark sessions as eval-ready

Add a toggle in the session detail view that marks a session as eval-ready. Display qualification criteria to help users select appropriate sessions:

**Qualification checklist (informational, not enforced):**
- Session completed (not abandoned mid-conversation)
- Contains at least one user prompt and assistant response
- Assistant output was correct or useful (user judgment)
- No sensitive data that should not be exported

**Data model additions to sessions table:**

```typescript
// Add to existing session schema
evalReady: v.optional(v.boolean()),        // Default false
reviewedAt: v.optional(v.number()),        // Timestamp when marked
evalNotes: v.optional(v.string()),         // User notes about this eval case
evalTags: v.optional(v.array(v.string())), // Optional categorization
```

#### UI components

**EvalReadyToggle**
- Location: Session detail view, near the title/metadata area
- Appearance: Switch with label "Include in Evals"
- Behavior: On toggle, set evalReady=true and reviewedAt=Date.now()
- Show small badge on session cards in list view when evalReady=true

**EvalNotesInput**
- Location: Below the toggle, visible when evalReady=true
- Appearance: Collapsible text area
- Placeholder: "Optional notes about this test case..."
- Purpose: Users can annotate why this session is a good eval case

**EvalTagsInput**
- Location: Below notes
- Appearance: Tag input with autocomplete from existing tags
- Purpose: Categorize evals by type (bug-fix, feature, refactor, etc.)

---

### 2. Eval export system

#### Export formats

Support three export formats optimized for different use cases:

**Format 1: DeepEval JSON**

```json
{
  "test_cases": [
    {
      "input": "User prompt text",
      "actual_output": "Assistant response text",
      "expected_output": "Assistant response text",
      "context": ["Tool results", "File contents from session"],
      "metadata": {
        "session_id": "abc123",
        "model": "claude-sonnet-4-20250514",
        "source": "claude-code",
        "tokens": 1523,
        "timestamp": "2026-01-15T10:30:00Z"
      }
    }
  ]
}
```

Notes:
- `expected_output` equals `actual_output` since user verified correctness by marking eval-ready
- `context` array includes tool call results and any file contents from the session
- One test case per user-assistant exchange (multi-turn sessions produce multiple test cases)

**Format 2: OpenAI Evals JSONL**

```jsonl
{"input": [{"role": "user", "content": "User prompt"}], "ideal": "Assistant response", "metadata": {"session_id": "abc123", "model": "claude-sonnet-4-20250514", "source": "opencode"}}
{"input": [{"role": "user", "content": "Another prompt"}], "ideal": "Another response", "metadata": {"session_id": "def456", "model": "gpt-4o", "source": "claude-code"}}
```

Notes:
- One JSON object per line
- `input` is array of messages for multi-turn context
- `ideal` is the expected correct response

**Format 3: Filesystem mode (plain text)**

Based on Letta research showing filesystem retrieval outperforms specialized tools.

```
sessions/
├── session-abc123.txt
├── session-def456.txt
├── session-ghi789.txt
└── manifest.json
```

Each session file:

```
================================================================================
SESSION: abc123
SOURCE: opencode
MODEL: claude-sonnet-4-20250514
DATE: 2026-01-15T10:30:00Z
TOKENS: 1523
TAGS: bug-fix, python
================================================================================

[2026-01-15T10:30:00Z] USER:
Fix the TypeError in the parse_config function. It's failing when the config 
file has empty values.

[2026-01-15T10:30:15Z] ASSISTANT:
I'll examine the parse_config function and fix the TypeError.

[TOOL_CALL: read_file]
path: src/config.py

[TOOL_RESULT]
def parse_config(path):
    with open(path) as f:
        data = json.load(f)
    return data['settings']['value'].strip()  # Fails if value is None

[2026-01-15T10:30:45Z] ASSISTANT:
Found the issue. The code calls .strip() on the value without checking for None.
Here's the fix:

[TOOL_CALL: edit_file]
path: src/config.py
changes: Add None check before strip()

[2026-01-15T10:31:00Z] USER:
That worked, thanks.

================================================================================
END SESSION
================================================================================
```

Manifest file:

```json
{
  "export_date": "2026-01-17T14:00:00Z",
  "total_sessions": 25,
  "sources": {
    "opencode": 18,
    "claude-code": 7
  },
  "models": ["claude-sonnet-4-20250514", "gpt-4o", "gemini-2.0-flash"],
  "files": ["session-abc123.txt", "session-def456.txt", "..."]
}
```

#### Export configuration UI

**EvalExportModal**

Trigger: "Export for Evals" button in dashboard sidebar or eval sessions list

Modal contents:

1. **Session selection**
   - Radio: "All eval-ready sessions" / "Select specific sessions"
   - If selecting: Checkbox list of eval-ready sessions with search/filter
   - Show count: "23 sessions selected (4,521 test cases)"

2. **Format selection**
   - Radio buttons with descriptions:
     - **DeepEval JSON** - Best for DeepEval framework, includes context array
     - **OpenAI Evals JSONL** - Compatible with OpenAI evals CLI
     - **Filesystem (Plain Text)** - Individual text files, best for filesystem-based retrieval testing
   
3. **Options**
   - Checkbox: Include system prompts
   - Checkbox: Include tool calls and results
   - Checkbox: Anonymize project paths (replace with /project/...)
   - Checkbox: Include README with instructions (default checked)

4. **Export button**
   - Label: "Download Export"
   - Downloads zip file containing export + README

#### README.txt included in export

```
================================================================================
OPENCODE SYNC - EVAL EXPORT
================================================================================

Export date: 2026-01-17T14:00:00Z
Format: DeepEval JSON
Sessions: 23
Test cases: 45
Sources: opencode (18), claude-code (5)

================================================================================
QUICK START
================================================================================

OPTION 1: DeepEval (Recommended - Free dashboard included)
----------------------------------------------------------

1. Install DeepEval:
   
   pip install deepeval

2. Run your eval:
   
   deepeval test run eval-export.json

3. View results at: https://app.confident-ai.com
   (Creates free account on first run)

Documentation: https://docs.deepeval.com/docs/getting-started


OPTION 2: OpenAI Evals
----------------------------------------------------------

1. Install OpenAI Evals:
   
   pip install openai-evals

2. Set your API key:
   
   export OPENAI_API_KEY=your-key-here

3. Run eval:
   
   oaieval gpt-4o eval-export.jsonl

Documentation: https://github.com/openai/evals


OPTION 3: Promptfoo (Compare multiple models)
----------------------------------------------------------

1. Initialize Promptfoo:
   
   npx promptfoo@latest init

2. Point to your export in promptfooconfig.yaml

3. Run comparison:
   
   npx promptfoo@latest eval

Documentation: https://promptfoo.dev/docs/getting-started


================================================================================
FORMAT COMPATIBILITY
================================================================================

This export includes:

- eval-export.json      -> DeepEval format
- eval-export.jsonl     -> OpenAI Evals format  
- sessions/             -> Filesystem format (if selected)
- manifest.json         -> Export metadata
- README.txt            -> This file

DeepEval JSON works with:
- DeepEval CLI and Python SDK
- Confident AI dashboard
- Custom Python scripts

OpenAI Evals JSONL works with:
- OpenAI evals CLI
- Braintrust (https://braintrust.dev)
- Custom evaluation scripts

Filesystem format works with:
- Testing retrieval with grep/search tools
- Agents that use file-based context
- Custom RAG evaluation


================================================================================
NEED HELP?
================================================================================

OpenCode Sync docs: https://your-opensync-url.com/docs
DeepEval Discord: https://discord.gg/deepeval
OpenAI Evals GitHub: https://github.com/openai/evals/issues

================================================================================
```

---

### 3. Post-export experience

#### What's Next panel

After download completes, show an inline panel (not modal) with quick actions:

**Panel header:** "What's Next: Run Your Evals"

**Content:**

```
Your export is ready! Here's how to run evals in under 5 minutes:

┌─────────────────────────────────────────────────────────────────┐
│ DeepEval (Recommended)                                          │
│                                                                 │
│ pip install deepeval                                            │
│ deepeval test run eval-export.json                    [Copy]    │
│                                                                 │
│ Results appear at: https://app.confident-ai.com                 │
│ [View DeepEval Docs →]                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ OpenAI Evals                                                    │
│                                                                 │
│ pip install openai-evals                                        │
│ oaieval gpt-4o eval-export.jsonl                      [Copy]    │
│                                                                 │
│ [View OpenAI Evals Docs →]                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Promptfoo (Compare Models)                                      │
│                                                                 │
│ npx promptfoo@latest init                                       │
│ npx promptfoo@latest eval                             [Copy]    │
│                                                                 │
│ [View Promptfoo Docs →]                                         │
└─────────────────────────────────────────────────────────────────┘

Format note: Your download includes both .json (DeepEval) and .jsonl 
(OpenAI) formats. Use whichever matches your preferred tool.
```

**Dismiss behavior:** Panel stays visible until user clicks "Got it" or navigates away. Do not auto-dismiss.

---

### 4. Eval sessions list view

#### Dedicated evals section in sidebar

Add "Evals" item to main navigation sidebar, between Sessions and Settings.

**Evals page content:**

1. **Stats bar**
   - Eval-ready sessions: 23
   - Total test cases: 45
   - Sources: OpenCode (18), Claude Code (5)
   - Last export: Jan 15, 2026

2. **Session list**
   - Filtered to evalReady=true sessions only
   - Columns: Title, Source (opencode/claude-code), Model, Messages, Date, Tags
   - Bulk actions: Remove from evals, Export selected
   - Click row to open session detail

3. **Empty state**
   - Show when no eval-ready sessions exist
   - Message: "No sessions marked for evals yet"
   - CTA: "Browse your sessions to mark some as eval-ready"
   - Link to sessions list

4. **Export button**
   - Prominent placement top-right
   - Label: "Export for Evals"
   - Opens EvalExportModal

---

## API specifications

### New endpoints

#### Mark session eval-ready

```
PATCH /api/sessions/:id/eval-ready

Request body:
{
  "evalReady": true,
  "evalNotes": "Good example of fixing a TypeScript type error",
  "evalTags": ["bug-fix", "typescript"]
}

Response:
{
  "success": true,
  "session": { ...updated session object }
}
```

#### List eval-ready sessions

```
GET /api/sessions/eval-ready

Query params:
- source: "opencode" | "claude-code" | "all" (default: all)
- tags: comma-separated list
- limit: number (default: 100)
- cursor: pagination cursor

Response:
{
  "sessions": [...],
  "stats": {
    "total": 23,
    "bySource": { "opencode": 18, "claude-code": 5 },
    "byModel": { "claude-sonnet-4-20250514": 15, "gpt-4o": 8 },
    "totalTestCases": 45
  },
  "nextCursor": "..."
}
```

#### Export evals

```
POST /api/export/evals

Request body:
{
  "sessionIds": ["abc123", "def456"] | "all",
  "formats": ["deepeval", "openai", "filesystem"],
  "options": {
    "includeSystemPrompts": false,
    "includeToolCalls": true,
    "anonymizePaths": true,
    "includeReadme": true
  }
}

Response:
{
  "downloadUrl": "https://...",
  "expiresAt": "2026-01-17T15:00:00Z",
  "stats": {
    "sessions": 23,
    "testCases": 45,
    "formats": ["deepeval", "openai", "filesystem"]
  }
}
```

### Convex functions

```typescript
// convex/evals.ts

// Mark session as eval-ready
export const markEvalReady = mutation({
  args: {
    sessionId: v.id("sessions"),
    evalReady: v.boolean(),
    evalNotes: v.optional(v.string()),
    evalTags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Verify session belongs to authenticated user
    // Update session with eval fields
    // Set reviewedAt if marking as ready
  },
});

// List eval-ready sessions
export const listEvalSessions = query({
  args: {
    source: v.optional(v.union(v.literal("opencode"), v.literal("claude-code"))),
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Query sessions where evalReady=true
    // Filter by source and tags if provided
    // Compute stats
    // Return sessions with pagination
  },
});

// Generate eval export
export const generateEvalExport = action({
  args: {
    sessionIds: v.union(v.array(v.id("sessions")), v.literal("all")),
    formats: v.array(v.union(
      v.literal("deepeval"),
      v.literal("openai"),
      v.literal("filesystem")
    )),
    options: v.object({
      includeSystemPrompts: v.boolean(),
      includeToolCalls: v.boolean(),
      anonymizePaths: v.boolean(),
      includeReadme: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    // Fetch sessions and messages
    // Transform to each requested format
    // Generate README if requested
    // Create zip file
    // Upload to storage and return signed URL
  },
});
```

---

## UI component specifications

### New components to create

| Component | Location | Purpose |
|-----------|----------|---------|
| EvalReadyToggle | Session detail view | Toggle switch with label |
| EvalNotesInput | Session detail view | Collapsible text area for notes |
| EvalTagsInput | Session detail view | Tag input with autocomplete |
| EvalBadge | Session list cards | Small indicator when evalReady |
| EvalsPage | Main navigation | Container for evals section |
| EvalSessionList | Evals page | Filtered list of eval sessions |
| EvalStatsBar | Evals page | Summary statistics |
| EvalExportModal | Evals page, Dashboard | Export configuration dialog |
| EvalExportProgress | Modal | Progress indicator during export |
| WhatsNextPanel | Post-export | Inline panel with commands and links |
| CommandCopyBlock | WhatsNextPanel | Code block with copy button |

### Component hierarchy

```
EvalsPage
├── EvalStatsBar
│   ├── StatCard (sessions count)
│   ├── StatCard (test cases count)
│   ├── StatCard (sources breakdown)
│   └── StatCard (last export)
├── EvalSessionList
│   ├── EvalSessionRow
│   │   ├── EvalBadge
│   │   └── TagsList
│   └── EmptyState
├── EvalExportModal
│   ├── SessionSelector
│   ├── FormatSelector
│   ├── ExportOptions
│   ├── EvalExportProgress
│   └── WhatsNextPanel
│       └── CommandCopyBlock (x3)
└── ExportButton
```

---

## Implementation phases

### Phase 1: Schema and basic qualification (2-3 days)

- Add eval fields to sessions schema
- Create EvalReadyToggle component
- Add toggle to session detail view
- Create markEvalReady mutation
- Add EvalBadge to session list cards

### Phase 2: Evals page and list (2-3 days)

- Create EvalsPage container
- Create EvalSessionList with filtering
- Create EvalStatsBar
- Add Evals to sidebar navigation
- Create listEvalSessions query

### Phase 3: Export system (3-4 days)

- Create DeepEval format transformer
- Create OpenAI Evals format transformer
- Create Filesystem format transformer
- Create README generator
- Create zip packaging logic
- Create generateEvalExport action
- Create EvalExportModal UI

### Phase 4: Post-export experience (1-2 days)

- Create WhatsNextPanel component
- Create CommandCopyBlock with copy functionality
- Wire up panel display after export
- Add links to external documentation

### Phase 5: Polish and testing (2 days)

- End-to-end testing of export formats
- Verify exports work with DeepEval CLI
- Verify exports work with OpenAI evals
- Error handling and edge cases
- Loading states and progress indicators

**Total estimated effort: 10-14 days**

---

## Success metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sessions marked eval-ready | 15% of completed sessions | Query evalReady=true count |
| Export downloads per week | 20+ exports | Track generateEvalExport calls |
| Users with 5+ eval sessions | 30% of active users | Query distinct users with evalReady sessions |
| README copy-button clicks | 50% of exports | Track click events on WhatsNextPanel |

---

## Future considerations

Not in scope for this PRD but worth noting for future iterations:

1. **Eval results storage** - Let users upload results back to OpenCode Sync to track scores over time
2. **Model comparison view** - Show which models score best on user's personal evals
3. **Shared eval datasets** - Let users publish anonymized eval sets for others to use
4. **Automated quality scoring** - Suggest which sessions might make good evals based on patterns
5. **Direct Confident AI integration** - One-click upload to DeepEval cloud dashboard

---

## File placement

When implementing, add files to the existing OpenCode Sync structure:

```
opencode-sync/
├── convex/
│   ├── schema.ts          # Add eval fields to sessions
│   └── evals.ts           # New file: eval queries, mutations, actions
├── src/
│   ├── pages/
│   │   └── Evals.tsx      # New file: Evals page
│   ├── components/
│   │   ├── evals/
│   │   │   ├── EvalReadyToggle.tsx
│   │   │   ├── EvalNotesInput.tsx
│   │   │   ├── EvalTagsInput.tsx
│   │   │   ├── EvalBadge.tsx
│   │   │   ├── EvalSessionList.tsx
│   │   │   ├── EvalStatsBar.tsx
│   │   │   ├── EvalExportModal.tsx
│   │   │   ├── WhatsNextPanel.tsx
│   │   │   └── CommandCopyBlock.tsx
│   │   └── ... existing components
│   └── lib/
│       └── evalTransformers.ts  # Format conversion utilities
└── docs/
    └── EVALS.md           # User-facing documentation
```

---

## References

- Letta research on filesystem-based retrieval: https://www.letta.com/blog/benchmarking-ai-agent-memory
- DeepEval documentation: https://docs.deepeval.com
- OpenAI Evals repository: https://github.com/openai/evals
- Promptfoo documentation: https://promptfoo.dev/docs
- Confident AI dashboard: https://app.confident-ai.com
