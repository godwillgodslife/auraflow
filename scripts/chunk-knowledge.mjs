export function splitKnowledgeTextIntoChunks(text = '', chunkSize = 1000) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalizedText) return [];

  const size = Math.max(250, Number(chunkSize) || 1000);
  const chunks = [];
  for (let index = 0; index < normalizedText.length; index += size) {
    chunks.push(normalizedText.slice(index, index + size));
  }
  return chunks;
}

export function buildKnowledgeChunkSummary({ title = '', text = '', url = '', chunkSize = 1000 } = {}) {
  const chunks = splitKnowledgeTextIntoChunks(text || url || title || '', chunkSize);
  return {
    chunkCount: chunks.length || 1,
    chunks: chunks.length ? chunks : [String(url || title || 'Workspace knowledge').trim()],
    sourceTitle: title || '',
    sourceUrl: url || ''
  };
}
