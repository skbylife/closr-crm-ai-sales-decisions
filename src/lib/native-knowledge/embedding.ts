/** pgvector schema compatibility contract. Stub models are test-only. */
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingVector {
  values: number[];
  model: string;
}

export function validateEmbedding(values: unknown, model: string): asserts values is number[] {
  if (!model.trim() || model.length > 200) throw new Error('Embedding model identifier is required');
  if (!Array.isArray(values) || values.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS ||
      values.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
      !values.some(value => value !== 0)) {
    throw new Error(`Embedding must contain ${KNOWLEDGE_EMBEDDING_DIMENSIONS} finite values and have nonzero norm`);
  }
}

export function vectorParameter(vector: EmbeddingVector): string {
  validateEmbedding(vector.values, vector.model);
  return JSON.stringify(vector.values);
}
