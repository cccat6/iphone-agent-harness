# Harness runtime implementation

The runtime exposes a fixed tool vocabulary, with skills supplying operation guidance. The UI uses one conversational entry; intent handling determines whether the agent answers, plans or executes. A requested plan is presented for review.

A run locks ownership before asynchronous work. Model reads, tool calls and state checks are cancellable. Execution accepts replies belonging to the active run. Durable tool results record returned, undispatched and unknown outcomes. Tasks continue until completion, pause or Stop; configured budgets and per-plan limits bound individual operations.

Phone plans are fully validated before first dispatch and rechecked across asynchronous boundaries. Every gesture ends released. Capture barriers wait for release and local image persistence. Observations retain source dimensions, orientation and actual timing metadata. Only relevant frames observed in the current run support physical task completion.

The default completion setting asks the model to verify the target result before returning to Harness. Users can disable the return in Settings → Task completion. Result verification applies in either setting.

Stable system instructions, locale, trusted procedures and pinned Skill metadata precede history. Provider-specific reasoning state stays scoped to its account/model/endpoint, with the conversation rendering user-facing messages. Compaction commits checkpoints atomically, retaining goal, recent complete tool groups and evidence references. Credential records remain separate from exports.

Gesture correction uses current observed mismatches. `phone_remember_interaction` stores short component notes scoped to session, target and orientation, backed by actual current-run frame IDs. These notes guide later actions for the same component and screen context.

[Storage/runtime](runtime.md) · [Prompts and skills](skills.md)
