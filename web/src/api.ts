import type { SearchResultWord, WordResponse } from './types';

export async function searchApi(
  q: string,
  kind: string,
  signal: AbortSignal,
): Promise<SearchResultWord[]> {
  const res = await fetch(
    `/api/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}`,
    { signal },
  );
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return ((await res.json()) as { results: SearchResultWord[] }).results;
}

export async function wordApi(normTerm: string): Promise<WordResponse> {
  const res = await fetch(`/api/word/${encodeURIComponent(normTerm)}`);
  if (!res.ok) throw new Error(`word lookup failed: ${res.status}`);
  return (await res.json()) as WordResponse;
}
