export const noteHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
export function pitchStep(position: number, previous: number | null): number {
  const exact = 48 + 36 * Math.max(0, Math.min(1, position));
  return previous === null || Math.abs(exact - previous) > 0.62 ? Math.round(exact) : previous;
}
// The original diameter opened the airway as it increased. Lowering Chimera's tongue does so.
export const tongueHeight = (position: number) => 7.5 - 1.8 * Math.max(0, Math.min(1, position));
