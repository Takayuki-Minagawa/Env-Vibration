interface CubicSegment {
  x: number
  a: number
  b: number
  c: number
  d: number
}

const binarySearchInterval = (x: number[], target: number): number => {
  let low = 0
  let high = x.length - 2

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (target < x[mid]) {
      high = mid - 1
    } else if (target > x[mid + 1]) {
      low = mid + 1
    } else {
      return mid
    }
  }

  return Math.max(0, Math.min(x.length - 2, low))
}

export const createAkimaInterpolator = (
  x: number[],
  y: number[],
): ((target: number) => number) => {
  if (x.length !== y.length || x.length === 0) {
    throw new Error('Invalid Akima input')
  }

  if (x.length === 1) {
    return () => y[0]
  }

  if (x.length === 2) {
    const dx = x[1] - x[0]
    const slope = dx === 0 ? 0 : (y[1] - y[0]) / dx
    return (target) => y[0] + slope * (target - x[0])
  }

  const n = x.length
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i += 1) {
    const h = x[i + 1] - x[i]
    if (h <= 0) {
      throw new Error('x must be strictly increasing')
    }
    slopes.push((y[i + 1] - y[i]) / h)
  }

  const ext: number[] = Array.from({ length: n + 3 }, () => 0)
  for (let i = 0; i < slopes.length; i += 1) {
    ext[i + 2] = slopes[i]
  }

  ext[1] = 2 * ext[2] - ext[3]
  ext[0] = 2 * ext[1] - ext[2]
  ext[n + 1] = 2 * ext[n] - ext[n - 1]
  ext[n + 2] = 2 * ext[n + 1] - ext[n]

  const deriv: number[] = []
  for (let i = 0; i < n; i += 1) {
    const w1 = Math.abs(ext[i + 3] - ext[i + 2])
    const w2 = Math.abs(ext[i + 1] - ext[i])
    const denom = w1 + w2
    if (denom > 0) {
      deriv.push((w1 * ext[i + 1] + w2 * ext[i + 2]) / denom)
    } else {
      deriv.push((ext[i + 1] + ext[i + 2]) / 2)
    }
  }

  const segments: CubicSegment[] = []
  for (let i = 0; i < n - 1; i += 1) {
    const h = x[i + 1] - x[i]
    const m = slopes[i]
    const a = y[i]
    const b = deriv[i]
    const c = (3 * m - 2 * deriv[i] - deriv[i + 1]) / h
    const d = (deriv[i] + deriv[i + 1] - 2 * m) / (h * h)
    segments.push({ x: x[i], a, b, c, d })
  }

  return (target: number) => {
    const interval =
      target <= x[0]
        ? 0
        : target >= x[n - 1]
          ? n - 2
          : binarySearchInterval(x, target)
    const seg = segments[interval]
    const dx = target - seg.x
    return seg.a + seg.b * dx + seg.c * dx * dx + seg.d * dx * dx * dx
  }
}
