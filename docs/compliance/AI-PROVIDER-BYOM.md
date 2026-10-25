# Bring Your Own Model Provider

## Customer-Owned Provider

The normal installation defaults to disabled AI. `src/lib/ai-provider.ts` reads operator settings; the Compose environment map exposes `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` and `AI_EMBEDDING_MODEL`. Adding other variables to an env file does not automatically pass them through Compose. See [self-hosting](../../SELF_HOSTING.md) for exact configuration.

## Capability Matrix

| Configuration | Required capability | Validation scope |
|---|---|---|
| Disabled | None | Clean installation, CRUD and offline knowledge import |
| Customer OpenAI-compatible | Chat completions and required response format | Operator must test selected model with synthetic inputs |
| Optional embeddings | Embeddings endpoint, 1536 dimensions | Stub/integration retrieval tests do not verify a real provider |
| Local OpenAI-compatible | Separately hosted reachable endpoint | No model runtime is bundled; localhost inside a container is not the host |

## Release Gate

Record endpoint ownership, model/version, region and approved data scope privately. Verify timeouts, malformed responses, disabled/missing-key behavior and cost limits before enabling real traffic. Real paid inference was not exercised by this release's no-key Compose acceptance. Do not claim provider certification from `verify:ai-provider`, which checks configuration rather than provider contractual controls.
