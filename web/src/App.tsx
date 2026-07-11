import { useEffect, useRef, useState } from 'react';
import { searchApi } from './api';
import type { SearchResultWord } from './types';
import WordDetail from './WordDetail';
import ThemeToggle from './ThemeToggle';

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'vocab', label: 'Vocab' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'sentence', label: 'Sentences' },
];

function sourceBadges(r: SearchResultWord): string[] {
  const badges = r.sources
    .filter((s) => s.sourceType !== 'lesson')
    .map((s) => s.sourceRef);
  if (r.lessonCount === 1) {
    const d = r.sources.find((s) => s.sourceType === 'lesson');
    if (d) badges.push(d.sourceRef);
  } else if (r.lessonCount > 1) {
    badges.push(`×${r.lessonCount} lessons`);
  }
  return badges;
}

export default function App() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [results, setResults] = useState<SearchResultWord[]>([]);
  const [sel, setSel] = useState(0);
  const [detail, setDetail] = useState<SearchResultWord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        setError(null);
        return;
      }
      try {
        setResults(await searchApi(q, kind, ctrl.signal));
        setSel(0);
        setError(null);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError('Search failed — is the server running?');
        }
      }
    }, 100);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (detail) setDetail(null);
        else {
          setQ('');
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[sel]) {
      setDetail(results[sel]);
    }
  };

  return (
    <div className="app">
      <header className="search-header">
        <div className="header-row">
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="還付 · かんぷ · refund …"
            className="search-input"
            spellCheck={false}
          />
          <ThemeToggle />
        </div>
        <nav className="filter-tabs">
          {KINDS.map((k) => (
            <button
              key={k.key}
              className={kind === k.key ? 'tab active' : 'tab'}
              onClick={() => setKind(k.key)}
            >
              {k.label}
            </button>
          ))}
        </nav>
      </header>

      {error && <p className="error">{error}</p>}

      {detail ? (
        <WordDetail result={detail} onBack={() => setDetail(null)} />
      ) : (
        <ul className="results">
          {results.map((r, i) => (
            <li
              key={`${r.normTerm ?? r.term}-${i}`}
              className={i === sel ? 'result selected' : 'result'}
              onClick={() => setDetail(r)}
              onMouseEnter={() => setSel(i)}
            >
              <span className="term">{r.term}</span>
              {r.reading && r.reading !== r.term && <span className="reading">{r.reading}</span>}
              <span className="gloss">{r.gloss ?? ''}</span>
              <span className="badges">
                {sourceBadges(r).map((b) => (
                  <span key={b} className="badge">
                    {b}
                  </span>
                ))}
              </span>
            </li>
          ))}
          {q.trim() && results.length === 0 && !error && (
            <li className="empty">No matches for “{q}”</li>
          )}
        </ul>
      )}
    </div>
  );
}
