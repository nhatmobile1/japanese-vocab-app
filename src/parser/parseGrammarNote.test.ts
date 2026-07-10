import { describe, expect, test } from 'vitest';
import { parseGrammarNote } from './parseGrammarNote.js';

const NOTE = `---
tags: [japanese, grammar, reference]
---

# 日本語 Grammar Quick Reference

## 1. Causative Form 〜させる

Some prose that is not indexed.

> [!tip]+ Pattern
> -   〜させる - to make/let someone do
`;

describe('parseGrammarNote', () => {
  test('indexes callout bullets as grammar entries with file-based sourceRef', () => {
    const r = parseGrammarNote(NOTE, 'Grammar-Quick-Reference.md');
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      kind: 'grammar',
      sourceType: 'grammar-note',
      sourceRef: 'Grammar-Quick-Reference',
      section: '1. Causative Form 〜させる',
      gloss: 'to make/let someone do',
    });
  });

  test('prose and headings are ignored without unparsed noise', () => {
    const r = parseGrammarNote(NOTE, 'Grammar-Quick-Reference.md');
    expect(r.unparsed).toHaveLength(0);
  });
});
