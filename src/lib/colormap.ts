/** ColorBrewer Spectral, blue → yellow → red. */
const STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [49, 54, 149],
  [69, 117, 180],
  [116, 173, 209],
  [171, 217, 233],
  [255, 255, 191],
  [254, 224, 144],
  [253, 174, 97],
  [244, 109, 67],
  [215, 48, 39],
];

export function spectralRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const index = Math.min(STOPS.length - 2, Math.floor(x));
  const mix = x - index;
  const a = STOPS[index];
  const b = STOPS[index + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * mix),
    Math.round(a[1] + (b[1] - a[1]) * mix),
    Math.round(a[2] + (b[2] - a[2]) * mix),
  ];
}

export function spectralCss(t: number): string {
  const [r, g, b] = spectralRgb(t);
  return `rgb(${r}, ${g}, ${b})`;
}

export const SPECTRAL_GRADIENT = `linear-gradient(90deg, ${STOPS.map(
  ([r, g, b]) => `rgb(${r}, ${g}, ${b})`,
).join(", ")})`;
