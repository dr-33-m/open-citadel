import type { ImageSourcePropType } from 'react-native';

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

/** Stable across equivalent inline source objects, but changes with request inputs. */
export function avatarSourceIdentity(source: ImageSourcePropType | undefined) {
  return source === undefined ? undefined : stableValue(source);
}
