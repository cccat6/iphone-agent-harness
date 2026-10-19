# Harness runtime implementation

The runtime exposes a fixed tool vocabulary. Skills contain guidance, not executable plugins or permission grants. The UI uses one conversational entry; internal intent/mode rules determine whether tools may inspect or act. Requests for a plan alone do not authorize its execution.

A run locks ownership before asynchronous work. Model reads, tool calls and state checks are cancellable; late replies cannot initiate another action. Durable tool results distinguish returned, not executed and unknown. No default whole-task budget is imposed, while explicitly configured budgets and each plan's safety limits remain enforceable.

Phone plans are fully validated before first dispatch and rechecked across asynchronous boundaries. Every gesture ends released. Capture barriers wait for release and local image persistence. Observations retain source dimensions, orientation and actual timing metadata. Only relevant frames observed in the current run support physical task completion.

The default completion setting asks the model to verify the target result before returning to Harness. Users can disable the return in Settings → Task completion; disabling return does not remove verification.

Stable system instructions, locale, trusted procedures and pinned Skill metadata precede history. Provider-specific reasoning state stays scoped to its account/model/endpoint and is not rendered as normal text. Compaction commits checkpoints atomically, retaining goal, recent complete tool groups and evidence references. Credential records remain separate from exports.

Gesture correction uses current observed mismatches. `phone_remember_interaction` stores short component notes scoped to session, target and orientation, backed by actual current-run frame IDs. It does not infer universal pointer offsets.

[Storage/runtime](runtime.md) · [Prompts and skills](skills.md)
