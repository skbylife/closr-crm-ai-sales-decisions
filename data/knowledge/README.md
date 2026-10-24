# Readable general knowledge corpus

`general-knowledge.json` contains 58 readable records: the 52 general methodology
notes found in the tracked knowledge seed plus six cultural profiles and framework
text found in BABEL's prompt source. Eight generic strategy patterns also populate
`strategy_cases`. This is source-derived knowledge, not a production database dump.

Every record has a stable identifier, source commit/path, source-text hash, publication
content hash, category/scenarios, language and license basis. `provenance-review.json`
records item-level classification. Project-owned original summaries and prompt text
are covered by LICENSE. Names such as MEDDIC, SPIN, Hofstede, Erin Meyer and Chris Voss
identify concepts/frameworks; this does not claim ownership of their works, trademark
rights, or a license to redistribute their books or proprietary datasets. No external
book full text, licensed score dataset, or production customer record is included.
The licensing basis is the project owner's authorization of repository-authored
material; this is not an independently authenticated history of how each note was written.

Four notes were edited transparently: unsourced numerical success/industry claims
were removed, and an unverified “real scene” was restated as an explicit hypothetical
role-based example. Numeric worked examples elsewhere are illustrative, not measured
customer results. Cultural profiles are heuristic reference material, not a reliable
basis for judging an individual's character or deciding their intent without evidence.

The external `babel-strategy-cases.json` referenced by the old importer is absent from
the GitHub snapshot. This corpus does not claim to reconstruct those missing records
or every row of the deployed database. Customer accounts, personal profiles, emails,
chat/business history, credentials, and unknown database exports remain excluded.

## Import without model credentials

After the native database migrations, run:

```sh
PG_SSL=false node scripts/native-knowledge-import.mjs
```

Set `DATABASE_URL` locally. The default command imports readable text and metadata;
it makes no embedding/model requests. Repeating the import is idempotent. It refuses
to overwrite a private record with a colliding identifier, and all writes are atomic.
Ordinary users can read approved general knowledge but cannot turn private records
into globally shared records. Account knowledge remains organization-scoped.

## Rebuild vectors with your own provider

Only when explicitly requested by the operator, `--embed` uses `AI_BASE_URL`,
`AI_API_KEY`, and `AI_EMBEDDING_MODEL` to call an OpenAI-compatible embeddings endpoint.
Secrets must stay in local environment/secrets storage. The endpoint must return
1536 finite dimensions with nonzero norm. Each vector stores its model identity and
dimension. Queries compare vectors only from the configured model; mismatched rows
are excluded from vector ranking and readable keyword search remains available.
Changing model requires re-embedding the corpus consistently. Changing dimensions
requires a deliberate schema/index migration, not just changing an environment name.

No embeddings are distributed. Offline integration tests inject a deterministic
1536-dimensional vector stub for storage/ranking tests; it is not a semantic model
and is never selected by normal application configuration.
