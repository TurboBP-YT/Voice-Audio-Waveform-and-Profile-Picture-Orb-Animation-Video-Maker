function mean(arr) {
  if (arr.length === 0) return 0; // Prevents dividing by zero (NaN)
  const sum = arr.reduce((total, current) => total + current, 0);
  return sum / arr.length;
}

function roundToNearestEven(num) {
  return Math.round(num / 2) * 2;
}

function roundToNearestOdd(num) {
  return Math.floor(num / 2) * 2 + 1;
}

/**
 * Linearly interpolates between two numbers with optional clamping.
 *
 * @param {number} start - The starting value (returned when t = 0).
 * @param {number} end - The ending value (returned when t = 1).
 * @param {number} t - The interpolation factor (typically between 0 and 1).
 * @param {boolean} [clamp=false] - Whether to restrict t between 0 and 1.
 * @returns {number} The interpolated value.
 */
function lerp(start, end, t, clamp = false) {
  const factor = clamp ? Math.min(Math.max(t, 0), 1) : t;
  return start + (end - start) * factor;
}

/**
 * Remaps a value from one range to another, similar to Blender's Map Range node.
 *
 * @param {number} value - The input value to remap.
 * @param {number} fromMin - The lower bound of the input range.
 * @param {number} fromMax - The upper bound of the input range.
 * @param {number} toMin - The lower bound of the target range.
 * @param {number} toMax - The upper bound of the target range.
 * @param {boolean} [clamp=false] - Whether to restrict the output within the target range.
 * @returns {number} The remapped value.
 */
function mapRange(value, fromMin, fromMax, toMin, toMax, clamp = false) {
  // Prevent division by zero if the input range has zero width
  if (fromMin === fromMax) {
    return toMin;
  }

  // Calculate normalized interpolation factor (inverse lerp)
  const t = (value - fromMin) / (fromMax - fromMin);

  // Reuse lerp with optional clamping
  return lerp(toMin, toMax, t, clamp);
}

/**
 * Constrains a value between a minimum and maximum bound.
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Standard cubic Hermite interpolation (C1 continuous).
 * Slope is 0 at both edges.
 */
function smoothstep(edge0, edge1, x) {
  // Scale, bias, and clamp x to the [0, 1] range
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);

  // Evaluate cubic polynomial: 3t^2 - 2t^3
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Ken Perlin's improved quintic interpolation (C2 continuous).
 * Both 1st and 2nd derivatives are 0 at the edges for a gentler transition.
 */
function smootherstep(edge0, edge1, x) {
  // Scale, bias, and clamp x to the [0, 1] range
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);

  // Evaluate quintic polynomial: 6t^5 - 15t^4 + 10t^3
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
