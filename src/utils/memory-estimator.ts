import * as Device from 'expo-device';

export type MemoryStatus = 'fits' | 'tight' | 'wont_fit';

export interface MemoryEstimate {
  totalBytes: number;
  totalGb: number;
  minDeviceMemoryGb: number | null;
  status: MemoryStatus;
}

/**
 * Check whether a model is likely to fit in memory using the Gallery's approach:
 * compare device total RAM against a pre-determined per-model minimum requirement.
 *
 * This is more reliable than parsing model internals because litert-lm models are
 * pre-compiled bundles with predictable memory requirements set by the model creator.
 */
export function checkModelMemory(
  minDeviceMemoryGb: number | null,
): MemoryEstimate {
  const totalBytes = Device.totalMemory ?? 0;
  const totalGb = totalBytes / (1024 * 1024 * 1024);

  if (!minDeviceMemoryGb) {
    return { totalBytes, totalGb, minDeviceMemoryGb, status: 'fits' };
  }

  let status: MemoryStatus;
  if (totalGb >= minDeviceMemoryGb) {
    status = 'fits';
  } else if (totalGb >= minDeviceMemoryGb * 0.8) {
    status = 'tight';
  } else {
    status = 'wont_fit';
  }

  console.log(
    `[MemoryEstimator] device=${totalGb.toFixed(1)}GB ` +
      `required=${minDeviceMemoryGb}GB → ${status}`,
  );

  return { totalBytes, totalGb, minDeviceMemoryGb, status };
}
