/** One of the phone's own text-to-speech voices. */
export type DeviceVoice = {
  identifier: string;
  name: string;
  language: string;
  quality: string;
};

/** One row of the voice list: a heading, or a voice under it. */
export type DeviceVoiceRow =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'voice'; key: string; voice: DeviceVoice };

/**
 * About how tall each kind of row is drawn, in points at the default type
 * size (`VoiceListRows`): a heading, a voice on one line, and a voice with
 * a second line under its name. Measured on a Galaxy A33.
 */
const ROW_HEIGHT = { header: 32, voice: 57, voiceWithDetail: 77 } as const;

/**
 * About how tall these rows will be once they are all drawn.
 *
 * The list draws its first screenful and the rest only when it is scrolled,
 * and this is the room it keeps for the rest meanwhile, so there is a whole
 * list to scroll into from the first frame and its length does not jump as
 * the rows arrive. An estimate is enough: it is replaced by the rows' own
 * height the moment the last of them is drawn.
 */
export function estimatedRowsHeight(rows: readonly DeviceVoiceRow[], fontScale = 1): number {
  let height = 0;
  for (const row of rows) {
    if (row.kind === 'header') height += ROW_HEIGHT.header;
    else height += row.voice.language ? ROW_HEIGHT.voiceWithDetail : ROW_HEIGHT.voice;
  }
  return Math.round(height * fontScale);
}

/**
 * How many voices these rows offer, as the sheet's heading says it: "14 total".
 * The phone's "System default" row is a way of not choosing, so it is not
 * counted, and a list with no voice to count says nothing.
 */
export function voiceTotalLabel(rows: readonly DeviceVoiceRow[]): string | null {
  let count = 0;
  for (const row of rows) {
    if (row.kind === 'voice' && row.voice.identifier !== '') count += 1;
  }
  return count > 0 ? `${count.toLocaleString()} total` : null;
}

/** The row that means "no particular voice": the phone's default. */
export const SYSTEM_DEFAULT_VOICE: DeviceVoice = {
  identifier: '',
  name: 'System default',
  language: '',
  quality: '',
};

/**
 * Google's Android TTS lists a placeholder per language ("en-AU-language")
 * next to its real voices. It has no voice data of its own, so choosing it just
 * asks the engine to download something and speaks in another voice meanwhile.
 */
export function isPlayableVoice(voice: { identifier: string }): boolean {
  return !/-language$/i.test(voice.identifier);
}

/** iOS identifiers end in the display name, for example `.en-ZA.Tessa`. */
function nameFromIdentifier(identifier: string): string {
  return identifier.split('.').at(-1)?.trim() || 'Selected voice';
}

/** The language a voice or a locale belongs under: "EN" for `en-ZA`, `en_US` or `en`. */
export function languageCode(tag: string): string {
  return tag.split(/[-_]/)[0].toUpperCase();
}

/*
 * Plain comparison, not `localeCompare`: Hermes hands every call of that to
 * the platform's collator, and a few thousand of them is a visible wait on a
 * slow phone. These are language tags and voice ids, which are ASCII.
 */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The voices in one fixed order: by locale, then by name. Android hands them
 * over as a set, in a different order every time it is asked.
 */
export function sortVoices(voices: DeviceVoice[]): DeviceVoice[] {
  return [...voices].sort((a, b) => compare(a.language, b.language) || compare(a.name, b.name));
}

/**
 * The list as rows: the default first, then the phone's English voices.
 * Other languages are left out until they are supported.
 */
export function deviceVoiceRows(voices: DeviceVoice[]): DeviceVoiceRow[] {
  const rows: DeviceVoiceRow[] = [
    { kind: 'header', key: 'header:DEFAULT', title: 'DEFAULT' },
    { kind: 'voice', key: '__default__', voice: SYSTEM_DEFAULT_VOICE },
  ];
  const english = voices.filter((voice) => languageCode(voice.language) === 'EN');
  if (english.length === 0) return rows;
  rows.push({ kind: 'header', key: 'header:ENGLISH', title: 'ENGLISH' });
  for (const voice of english) rows.push({ kind: 'voice', key: voice.identifier, voice });
  return rows;
}

/** The name to show for the saved voice `identifier` ('' or unknown-but-set are handled). */
export function deviceVoiceName(voices: DeviceVoice[], identifier: string): string {
  if (!identifier) return SYSTEM_DEFAULT_VOICE.name;
  return voices.find((voice) => voice.identifier === identifier)?.name ?? nameFromIdentifier(identifier);
}
