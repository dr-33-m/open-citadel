/**
 * Where the stretches of one copy of an episode sit in another.
 *
 * An ad server stitches a different set of ads into each download, so the copy
 * a listener plays and the copy that was transcribed share the show itself and
 * differ only where ads were put in. Given both fingerprints
 * (`fingerprint.ts`), this finds, for each stretch of the playing copy, where
 * the same sound is in the transcribed one: a piecewise map from one clock to
 * the other, with a gap wherever the playing copy has an ad the transcribed
 * one did not.
 *
 * How: every fingerprint word of the transcribed copy is indexed by value.
 * The playing copy is read in short blocks; each word in a block that also
 * appears in the transcribed copy votes for the shift between the two, and a
 * block whose votes agree is placed by that shift. Neighbouring blocks with
 * the same shift are one stretch, and each stretch's edges are then found to
 * the frame by comparing words bit by bit, so an ad boundary lands within
 * about 50ms rather than within a block.
 *
 * Pure, so it can be tested on its own.
 */
import type { TimeMapSegment } from 'samwell-shared';

import { FRAMES_PER_SECOND } from './fingerprint.js';

/** Five seconds of words per vote. */
const BLOCK = 100;
/** Fewest agreeing votes that place a block. Random agreement in a block is about none. */
const MIN_VOTES = 6;
/** A word that is everywhere (silence, a steady tone) says nothing about where. */
const MAX_POSITIONS = 24;
/** Shifts within this many frames are the same shift, jitter from re-encoding. */
const SAME_SHIFT = 2;
/** Frames between two runs at one shift that still make them one stretch. */
const SAME_STRETCH_GAP = 60 * FRAMES_PER_SECOND;
/** Fewest frames a stretch must run to be believed. */
const MIN_RUN = BLOCK * 2;
/** Bits two words of the same sound differ in, at most, to count as a match when edges are refined. */
const MATCH_BITS = 10;

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Positions of every word of `words`, by value, leaving out words too common to place anything. */
function indexWords(words: Uint32Array): Map<number, number[]> {
  const index = new Map<number, number[]>();
  for (let i = 0; i < words.length; i++) {
    const at = index.get(words[i]!);
    if (at) at.push(i);
    else index.set(words[i]!, [i]);
  }
  for (const [word, at] of index) if (at.length > MAX_POSITIONS) index.delete(word);
  return index;
}

/** The shift (transcribed frame minus playing frame) most of a block's words agree on, or null. */
function blockShift(playing: Uint32Array, start: number, index: Map<number, number[]>): number | null {
  const votes = new Map<number, number>();
  const end = Math.min(playing.length, start + BLOCK);
  for (let i = start; i < end; i++) {
    const at = index.get(playing[i]!);
    if (!at) continue;
    for (const j of at) votes.set(j - i, (votes.get(j - i) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestVotes = 0;
  for (const [shift, count] of votes) {
    // Jittered neighbours count with it.
    let total = count;
    for (let d = 1; d <= SAME_SHIFT; d++) total += (votes.get(shift - d) ?? 0) + (votes.get(shift + d) ?? 0);
    if (total > bestVotes) {
      bestVotes = total;
      best = shift;
    }
  }
  return bestVotes >= MIN_VOTES ? best : null;
}

/** Whether frame `i` of the playing copy sounds like frame `i + shift` of the transcribed one. */
function matches(playing: Uint32Array, transcribed: Uint32Array, i: number, shift: number): boolean {
  const j = i + shift;
  if (i < 0 || i >= playing.length || j < 0 || j >= transcribed.length) return false;
  return popcount((playing[i]! ^ transcribed[j]!) >>> 0) <= MATCH_BITS;
}

/** Frames of no match an edge is walked through: a pause in speech, a breath, a beat of music. */
const EDGE_PATIENCE = 2 * FRAMES_PER_SECOND;

/**
 * How far the match runs from `from`, one way (`step` 1 or -1). It walks on
 * through a pause of up to two seconds, and only moves the edge on two
 * matching frames in a row, which a stray frame of an ad does not give.
 */
function runEdge(playing: Uint32Array, transcribed: Uint32Array, from: number, shift: number, step: 1 | -1, limit: number): number {
  let edge = from;
  let misses = 0;
  for (let i = from; step > 0 ? i < limit : i >= limit; i += step) {
    if (matches(playing, transcribed, i, shift) && matches(playing, transcribed, i + step, shift)) {
      edge = i;
      misses = 0;
    } else if (++misses > EDGE_PATIENCE) break;
  }
  return edge;
}

interface Run {
  start: number;
  end: number;
  shift: number;
}

/**
 * The piecewise map from the playing copy's clock to the transcribed copy's,
 * in seconds, in playing order. Where the playing copy has sound the
 * transcribed copy lacks (an ad put in), no segment covers it.
 */
export function alignFingerprints(transcribed: Uint32Array, playing: Uint32Array): TimeMapSegment[] {
  const index = indexWords(transcribed);
  const runs: Run[] = [];
  for (let start = 0; start < playing.length; start += BLOCK) {
    const shift = blockShift(playing, start, index);
    if (shift === null) continue;
    const last = runs[runs.length - 1];
    // The same shift is the same stretch of the show, across blocks that
    // placed nothing in between (a pause, a music bed that came out otherwise).
    if (last && Math.abs(last.shift - shift) <= SAME_SHIFT && start - last.end <= SAME_STRETCH_GAP) {
      last.end = Math.min(playing.length, start + BLOCK);
    } else {
      runs.push({ start, end: Math.min(playing.length, start + BLOCK), shift });
    }
  }

  // Edges to the frame: each run grows or shrinks to where its sound really
  // starts and stops, never into its neighbour. Walked from inside its first
  // and last blocks, which were placed by their votes, so a pause anywhere in
  // the middle of a long stretch cannot cut it short.
  const kept = runs.filter((run) => run.end - run.start >= MIN_RUN);
  for (let r = 0; r < kept.length; r++) {
    const run = kept[r]!;
    const before = r > 0 ? kept[r - 1]!.end : 0;
    const after = r < kept.length - 1 ? kept[r + 1]!.start : playing.length;
    run.start = runEdge(playing, transcribed, run.start + BLOCK / 2, run.shift, -1, before);
    run.end = runEdge(playing, transcribed, run.end - BLOCK / 2, run.shift, 1, after) + 1;
  }

  return kept
    .filter((run) => run.end - run.start >= MIN_RUN)
    .map((run) => ({
      audioStart: run.start / FRAMES_PER_SECOND,
      audioEnd: run.end / FRAMES_PER_SECOND,
      transcriptStart: (run.start + run.shift) / FRAMES_PER_SECOND,
    }));
}
