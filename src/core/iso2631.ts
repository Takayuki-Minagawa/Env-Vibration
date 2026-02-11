interface SosFilter {
  b: [number, number, number]
  a: [number, number, number]
}

export interface IsoVibrationResult {
  vibrationLevel: number[]
  weightedAcceleration: number[]
  runningRms: number[]
}

type Orientation = 'horizontal' | 'vertical'

const A_REF = 1e-5

const prewarp = (frequencyHz: number, sampleRate: number): number =>
  2 * sampleRate * Math.tan(Math.PI * frequencyHz / sampleRate)

const bilinearBiquad = (
  b2: number,
  b1: number,
  b0: number,
  a1: number,
  a0: number,
  sampleRate: number,
): SosFilter => {
  const k = 2 * sampleRate
  const A0 = k * k + a1 * k + a0
  const A1 = -2 * k * k + 2 * a0
  const A2 = k * k - a1 * k + a0
  const B0 = b2 * k * k + b1 * k + b0
  const B1 = -2 * b2 * k * k + 2 * b0
  const B2 = b2 * k * k - b1 * k + b0

  return {
    b: [B0 / A0, B1 / A0, B2 / A0],
    a: [1, A1 / A0, A2 / A0],
  }
}

const applyBiquadFilter = (
  x: number[],
  b: [number, number, number],
  a: [number, number, number],
): number[] => {
  const y = new Array<number>(x.length)
  const [b0, b1, b2] = b
  const [, a1, a2] = a
  let s1 = 0
  let s2 = 0

  for (let n = 0; n < x.length; n += 1) {
    const xn = x[n]
    const y0 = b0 * xn + s1
    const s1New = b1 * xn - a1 * y0 + s2
    s2 = b2 * xn - a2 * y0
    y[n] = y0
    s1 = s1New
  }

  return y
}

const designIso2631Weighting = (
  sampleRate: number,
  orientation: Orientation,
): SosFilter[] => {
  const f1 = 0.4
  const q1 = 1 / Math.sqrt(2)
  let f2 = 100.0
  const q2 = 1 / Math.sqrt(2)
  let f3 = 2.0
  let f4 = 2.0
  let q4 = 0.63
  let f5 = 0
  let q5 = 0
  let f6 = 0
  let q6 = 0
  let useHs = false

  if (orientation === 'vertical') {
    f3 = 12.5
    f4 = 12.5
    q4 = 0.63
    f5 = 2.37
    q5 = 0.91
    f6 = 3.3
    q6 = 0.91
    useHs = true
  }

  const nyquist = sampleRate / 2
  if (f2 >= 0.98 * nyquist) {
    f2 = 0.98 * nyquist
  }

  const w1 = prewarp(f1, sampleRate)
  const w2 = prewarp(f2, sampleRate)
  const w3 = prewarp(f3, sampleRate)
  const w4 = prewarp(f4, sampleRate)

  const filters: SosFilter[] = []
  filters.push(bilinearBiquad(1, 0, 0, w1 / q1, w1 * w1, sampleRate))
  filters.push(
    bilinearBiquad(0, 0, w2 * w2, w2 / q2, w2 * w2, sampleRate),
  )
  filters.push(
    bilinearBiquad(0, (w4 * w4) / w3, w4 * w4, w4 / q4, w4 * w4, sampleRate),
  )

  if (useHs) {
    const w5 = prewarp(f5, sampleRate)
    const w6 = prewarp(f6, sampleRate)
    const gain = Math.pow(w5 / w6, 2)
    filters.push(
      bilinearBiquad(
        gain,
        (w5 / q5) * gain,
        (w5 * w5) * gain,
        w6 / q6,
        w6 * w6,
        sampleRate,
      ),
    )
  }

  return filters
}

const applyIsoWeightFilter = (
  acceleration: number[],
  sampleRate: number,
  orientation: Orientation,
): number[] => {
  const filters = designIso2631Weighting(sampleRate, orientation)
  return filters.reduce(
    (acc, filter) => applyBiquadFilter(acc, filter.b, filter.a),
    [...acceleration],
  )
}

const calculateRunningRms = (
  x: number[],
  sampleRate: number,
  tau: number,
): number[] => {
  const alpha = 1 - Math.exp(-1 / (sampleRate * tau))
  const y2 = new Array<number>(x.length)
  const rms = new Array<number>(x.length)

  for (let i = 0; i < x.length; i += 1) {
    const xn2 = x[i] * x[i]
    if (i === 0) {
      y2[i] = alpha * xn2
    } else {
      y2[i] = y2[i - 1] + alpha * (xn2 - y2[i - 1])
    }
    rms[i] = Math.sqrt(y2[i])
  }

  return rms
}

export const calculateIsoVibrationLevel = (
  accelerationMs2: number[],
  sampleRate: number,
  tau: number,
  orientation: Orientation,
): IsoVibrationResult => {
  if (!accelerationMs2.length) {
    throw new Error('acceleration input is empty')
  }

  const weightedAcceleration = applyIsoWeightFilter(
    accelerationMs2,
    sampleRate,
    orientation,
  )
  const runningRms = calculateRunningRms(weightedAcceleration, sampleRate, tau)
  const vibrationLevel = runningRms.map((rms) => {
    const safeValue = Math.max(rms, 1e-20)
    return 20 * Math.log10(safeValue / A_REF)
  })

  return {
    vibrationLevel,
    weightedAcceleration,
    runningRms,
  }
}
