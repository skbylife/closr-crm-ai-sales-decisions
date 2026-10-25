# AI Data Processing Addendum

This technical disclosure does not create a provider contract.

## Model Providers

`AI_PROVIDER=disabled` is the documented Compose default. No model key is needed for registration, CRM data storage or the normal knowledge seed. When enabled, chat/embedding requests can transmit relevant customer text, prompts and metadata to the configured endpoint. Review each workflow's input scope before using real records. A local OpenAI-compatible endpoint is separately operated; the application does not install a model server.

## No Training Commitment

The repository cannot guarantee that an external provider does not retain inputs or train on them. Operators must obtain and verify the provider's applicable retention/training commitments and account settings. A provider flag or this document is not such a commitment. Synthetic offline tests demonstrate application behavior only, not provider compliance.

Keep model keys outside Git and screenshots. Logs and error-monitoring destinations may themselves contain sensitive content and need review. Public knowledge embeddings are optional; use a compatible 1536-dimensional model and retain model identity. Existing production vectors are not included. See [BYOM](AI-PROVIDER-BYOM.md).
