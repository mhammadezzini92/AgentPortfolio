// Visitor questions go into FTS5 MATCH, whose syntax treats quotes, "-", ":", NEAR, AND/OR/NOT
// and column filters as operators. Reducing the question to bare letter/digit words and quoting
// each one leaves nothing for a visitor to inject and nothing that can raise a syntax error.

const MAX_TERMS = 12;
const MIN_PREFIX_LENGTH = 4;

const STOPWORDS = new Set([
  "a", "about", "after", "all", "also", "am", "an", "and", "any", "are", "as", "at", "be", "been",
  "before", "being", "but", "by", "can", "could", "describe", "did", "do", "does", "doing", "done",
  "for", "from", "give", "had", "has", "have", "having", "he", "her", "here", "hers", "him", "his",
  "herself", "himself", "how", "i", "if", "in", "into", "is", "it", "its", "just", "kind", "know", "let", "like", "me",
  "more", "most", "much", "my", "of", "on", "or", "our", "please", "she", "should", "so", "some",
  "tell", "than", "that", "the", "their", "them", "themselves", "then", "there", "these", "they", "this", "those",
  "to", "us", "very", "was", "we", "were", "what", "when", "where", "which", "who", "whom", "why",
  "will", "with", "would", "you", "your", "yours", "yourself",
]);

export function extractSearchTerms(question: string): string[] {
  const words = question.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = words.filter((word) => word.length > 1 && !STOPWORDS.has(word));
  return [...new Set(terms)].slice(0, MAX_TERMS);
}

// OR, not AND: long questions rarely have every word in one chunk, and bm25 already ranks
// chunks matching more terms higher. Prefix matching lets "postgres" find "postgresql".
export function buildMatchExpression(question: string): string | null {
  const terms = extractSearchTerms(question);
  if (terms.length === 0) return null;

  return terms.map((term) => (term.length >= MIN_PREFIX_LENGTH ? `"${term}"*` : `"${term}"`)).join(" OR ");
}
