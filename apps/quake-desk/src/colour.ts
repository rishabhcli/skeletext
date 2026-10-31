import type { Colour } from '@skeletext/core';

/** Teletext colour for a magnitude: below 5 white, 5 up to 6 yellow, 6 and above red. */
export function magnitudeColour(mag: number): Colour {
  if (mag >= 6) return 1;
  if (mag >= 5) return 3;
  return 7;
}
