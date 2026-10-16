import type { CatalogBookDetail } from '@/services/gutenberg/records';
import { formatCount } from '@/utils/format';

export type BookFact = { label: string; value: string };

/**
 * The languages most of Project Gutenberg is in. Named here because Hermes has
 * no `Intl.DisplayNames`, which is tried next for the rest.
 */
const LANGUAGES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  fi: 'Finnish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  la: 'Latin',
  el: 'Greek',
  grc: 'Ancient Greek',
  ru: 'Russian',
  pl: 'Polish',
  hu: 'Hungarian',
  zh: 'Chinese',
  ja: 'Japanese',
  eo: 'Esperanto',
  ca: 'Catalan',
  cy: 'Welsh',
  tl: 'Tagalog',
};

/** `en` as `English`, where it is known; the code otherwise. */
export function languageName(code: string): string {
  const known = LANGUAGES[code.toLowerCase()];
  if (known) return known;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** The catalogue's word on a book's rights, in plain words. */
function rightsText(publicDomain: boolean | null): string | null {
  if (publicDomain === true) return 'Public domain in the USA';
  if (publicDomain === false) return 'Still under copyright';
  return null;
}

/** The short facts under a free book's summary, leaving out any the catalogue did not give. */
export function bookFacts(book: Pick<CatalogBookDetail, 'language' | 'downloads' | 'publicDomain'>): BookFact[] {
  const facts: BookFact[] = [];
  if (book.language) facts.push({ label: 'Language', value: languageName(book.language) });
  if (book.downloads != null) facts.push({ label: 'Downloads, last 30 days', value: formatCount(book.downloads) });
  const rights = rightsText(book.publicDomain);
  if (rights) facts.push({ label: 'Rights', value: rights });
  return facts;
}
