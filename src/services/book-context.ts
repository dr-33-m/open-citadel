import { readAsStringAsync } from 'expo-file-system/legacy';
import JSZip from 'jszip';

interface Locator {
  href: string;
  locations?: {
    progression?: number;
    position?: number;
    totalProgression?: number;
  };
}

function stripHtml(html: string): string {
  // Remove script/style blocks first, then all tags
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function findOpfPath(zip: JSZip): Promise<string> {
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('No container.xml found');
  const match = containerXml.match(/full-path="([^"]+)"/);
  if (!match) throw new Error('No OPF path in container.xml');
  return match[1];
}

function opfBasePath(opfPath: string): string {
  const idx = opfPath.lastIndexOf('/');
  return idx >= 0 ? opfPath.slice(0, idx + 1) : '';
}

function findChapterFile(zip: JSZip, locatorHref: string, basePath: string): JSZip.JSZipObject | null {
  // Try exact match first (absolute path within zip)
  const fullPath = basePath + locatorHref;
  let file = zip.file(fullPath);
  if (file) return file;

  // Try without basePath (locator href may already be absolute)
  file = zip.file(locatorHref);
  if (file) return file;

  // Try matching by filename only
  const basename = locatorHref.split('/').pop() ?? '';
  const allFiles = zip.files;
  for (const name of Object.keys(allFiles)) {
    if (name.endsWith(basename) && !allFiles[name].dir) {
      return allFiles[name];
    }
  }
  return null;
}

/**
 * Extracts plain text from an EPUB chapter up to the given locator progression.
 * Falls back to the full chapter text if progression is unavailable.
 * Returns at most `maxChars` characters (the text immediately before the selection).
 */
export async function extractChapterTextToLocator(
  filePath: string,
  locator: Locator,
  maxChars = 3000,
): Promise<string> {
  // expo-file-system paths may have file:// prefix — strip it for readAsStringAsync
  const fsPath = filePath.startsWith('file://') ? filePath.slice(7) : filePath;

  const b64 = await readAsStringAsync(fsPath, { encoding: 'base64' });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const opfPath = await findOpfPath(zip);
  const basePath = opfBasePath(opfPath);

  const chapterFile = findChapterFile(zip, locator.href, basePath);
  if (!chapterFile) throw new Error(`Chapter not found: ${locator.href}`);

  const html = await chapterFile.async('string');
  const text = stripHtml(html);

  const progression = locator.locations?.progression ?? 1;
  const sliceEnd = Math.floor(text.length * progression);
  const sliced = text.slice(0, sliceEnd);

  // Return the last `maxChars` chars so the LLM gets the most relevant passage
  return sliced.length > maxChars ? sliced.slice(sliced.length - maxChars) : sliced;
}
