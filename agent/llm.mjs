// llm.mjs — §17.4: the optional LLM layer's one permitted effect. A model may raise `semantic-mismatch`
// flags; it can never remove or lower a flag (I18). Off by default (policy.json llm.enabled = false), it
// needs its own key, and nothing in tools/verify.mjs imports it. No model is called from this file: the
// caller passes whatever the model returned, and this decides what of it may be kept.

export const LLM_CHECK = 'semantic-mismatch';
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// existing: the flags Docket raised. modelOutput: anything. -> existing, unchanged and in order, plus
// at most the model's well-formed semantic-mismatch flags. Nothing the model returns can drop, edit or
// reorder an existing flag.
export function mergeLlmFlags(existing, modelOutput) {
  const kept = existing.map((f) => ({ ...f }));
  const added = (Array.isArray(modelOutput) ? modelOutput : [])
    .filter((f) => f && f.check === LLM_CHECK && SEVERITIES.includes(f.severity) && typeof f.detail === 'string')
    .map((f) => ({ check: LLM_CHECK, severity: f.severity, detail: `${f.detail} (model)`, evidence: { source: 'llm' } }));
  return [...kept, ...added];
}
