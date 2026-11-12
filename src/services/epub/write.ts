/** Writing a generated EPUB's files to disk as one package. */
import { EncodingType, makeDirectoryAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import JSZip from 'jszip';

/** Zips a package's files and writes it as `<dir><name>.epub`. Returns the path. */
export async function writeEpubFile(dir: string, name: string, files: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [file, body] of Object.entries(files)) {
    // The marker must be first and uncompressed, or the reader rejects the package.
    zip.file(file, body, { compression: file === 'mimetype' ? 'STORE' : 'DEFLATE' });
  }
  const base64 = await zip.generateAsync({ type: 'base64', mimeType: 'application/epub+zip' });
  await makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const path = `${dir}${name}.epub`;
  await writeAsStringAsync(path, base64, { encoding: EncodingType.Base64 });
  return path;
}
