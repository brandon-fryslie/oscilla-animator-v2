/**
 * block-catalog.test — unit coverage for the catalog's derived-view helpers,
 * with the search semantics pinned deliberately.
 *
 * `searchEntries` trims the query: leading/trailing whitespace from real input
 * (a pasted or fat-fingered "Sin ") still matches, and a whitespace-only query is
 * treated as no filter (returns everything), the same as an empty query. These
 * are intentional choices, asserted here so they cannot silently regress.
 * [LAW:verifiable-goals]
 */

import { describe, it, expect } from 'vitest';
import {
  type CatalogEntry,
  searchEntries,
  insertableEntries,
  catalogCategories,
} from '../block-catalog';

function entry(over: Partial<CatalogEntry> & { type: string }): CatalogEntry {
  return {
    label: over.type,
    category: 'Math',
    form: 'primitive',
    editable: true,
    insertable: true,
    openBehavior: { kind: 'none' },
    inputs: [],
    outputs: [],
    ...over,
  };
}

const entries: readonly CatalogEntry[] = [
  entry({ type: 'Sin', label: 'Sine', description: 'sine wave' }),
  entry({ type: 'Mul', label: 'Multiply' }),
  entry({ type: 'Const', label: 'Constant', category: 'Source', insertable: false }),
];

describe('searchEntries', () => {
  it('returns every entry for an empty query', () => {
    expect(searchEntries(entries, '')).toHaveLength(entries.length);
  });

  it('treats a whitespace-only query as no filter (returns all)', () => {
    expect(searchEntries(entries, '   ')).toHaveLength(entries.length);
  });

  it('trims surrounding whitespace so a real query with stray spaces still matches', () => {
    const hits = searchEntries(entries, '  Sine  ').map((e) => e.type);
    expect(hits).toEqual(['Sin']);
  });

  it('matches case-insensitively across type, label, and description', () => {
    expect(searchEntries(entries, 'SINE').map((e) => e.type)).toEqual(['Sin']); // label "Sine" + desc
    expect(searchEntries(entries, 'const').map((e) => e.type)).toEqual(['Const']); // type/label
    expect(searchEntries(entries, 'MULTIPLY').map((e) => e.type)).toEqual(['Mul']); // label
  });

  it('returns nothing when no field matches', () => {
    expect(searchEntries(entries, 'zzz-no-such-block')).toEqual([]);
  });
});

describe('derived views', () => {
  it('insertableEntries excludes non-insertable entries', () => {
    expect(insertableEntries(entries).map((e) => e.type)).toEqual(['Sin', 'Mul']);
  });

  it('catalogCategories is sorted, unique, and over insertable entries only', () => {
    // "Source" (Const) is non-insertable, so it must not appear.
    expect(catalogCategories(entries)).toEqual(['Math']);
  });
});
