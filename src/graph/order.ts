/**
 * Compare quest keys by Unicode code point, independently of the host locale.
 *
 * `localeCompare` is deliberately avoided here: its result can vary with the
 * process locale and therefore make serialized graph output unstable.
 */
export function compareQuestKeys(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return leftPoints.length - rightPoints.length;
}

export function sortedQuestKeys(keys: Iterable<string>): string[] {
  return [...keys].sort(compareQuestKeys);
}
