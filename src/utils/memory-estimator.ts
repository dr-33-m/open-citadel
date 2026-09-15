import * as Device from 'expo-device';

export type MemoryStatus = 'fits' | 'tight' | 'wontRun';

export interface MemoryEstimate {
  totalBytes: number;
  totalGb: number;
  /** The model's own size on disk, which is what the estimate is derived from. */
  modelBytes: number | null;
  status: MemoryStatus;
}

/**
 * Whether a model is likely to run, judged from its actual file size against
 * this device's RAM.
 *
 * This used to compare against a `minDeviceMemoryGb` written by hand per model.
 * Two problems: it does not scale past the handful of models someone remembered
 * to annotate (the catalogue offers 147 files), and it was wrong where it did
 * exist — Gemma 4 E2B was marked as needing 8 GB, which on a 5.3 GB phone
 * evaluated to "won't fit" for the one model known to work there.
 *
 * The thresholds come from that measurement rather than from a formula: 2.59 GB
 * of weights runs on a 5.3 GB device, which is 49% of total RAM, so the tight
 * band has to sit above that and the comfortable band below it. Weights are
 * only part of peak usage — the KV cache and activations are on top — which is
 * why even the generous band stops well short of all the RAM the phone has.
 */
const FITS_FRACTION = 0.4;
const TIGHT_FRACTION = 0.55;

export function modelFit(modelBytes: number | null): MemoryStatus {
  const totalBytes = Device.totalMemory ?? 0;
  // Nothing to judge with: say yes rather than hide a model over a missing
  // number. A failed load is recoverable; an empty catalogue is confusing.
  if (!modelBytes || !totalBytes) return 'fits';

  const ratio = modelBytes / totalBytes;
  if (ratio <= FITS_FRACTION) return 'fits';
  if (ratio <= TIGHT_FRACTION) return 'tight';
  return 'wontRun';
}

/** `modelFit`, plus the numbers it was decided from, for the info sheet. */
export function checkModelMemory(modelBytes: number | null): MemoryEstimate {
  const totalBytes = Device.totalMemory ?? 0;
  const totalGb = totalBytes / (1024 * 1024 * 1024);
  const status = modelFit(modelBytes);

  console.log(
    `[MemoryEstimator] device=${totalGb.toFixed(1)}GB ` +
      `model=${modelBytes ? (modelBytes / (1024 * 1024 * 1024)).toFixed(2) : '?'}GB → ${status}`,
  );

  return { totalBytes, totalGb, modelBytes, status };
}

/** The largest model worth offering on this device, in bytes. */
export function maxRunnableBytes(): number {
  const totalBytes = Device.totalMemory ?? 0;
  return totalBytes ? Math.floor(totalBytes * TIGHT_FRACTION) : 0;
}
