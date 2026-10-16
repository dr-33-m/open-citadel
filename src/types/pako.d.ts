/** The one part of pako (JSZip's own inflater) the app calls directly. */
declare module 'pako' {
  export function inflateRaw(data: Uint8Array): Uint8Array;
}
