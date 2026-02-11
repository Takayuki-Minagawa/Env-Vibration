import { createAkimaInterpolator } from './akima'
import {
  MIN_ACC_FOR_DB,
  MIN_LOG_VALUE,
  OCTAVE_BANDS,
  ORIGINAL_SAMPLE_INTERVAL,
  RESAMPLED_RATE,
} from './constants'
import {
  add,
  complex,
  conjugate,
  copyComplexArray,
  div,
  magnitude,
  mul,
  scale,
  type Complex,
} from './complex'
import {
  fftForward,
  fftInverse,
  nextPowerOfTwo,
  padRealToComplex,
  serializeAmplitude,
} from './fft'
import { calculateIsoVibrationLevel } from './iso2631'
import type { AnalysisRequest, AnalysisResult, RangeSelection, VibrationType } from './types'

interface SourceData {
  wave: number[]
  spectrumSource: Complex[]
  selectedRange?: RangeSelection
}

interface SpectralResult {
  octaveMax: number[]
  fftAmplitude: number[]
  fftFrequency: number[]
}

const clampRange = (range: RangeSelection, length: number): RangeSelection => {
  const start = Math.max(0, Math.min(length - 1, Math.floor(Math.min(range.start, range.end))))
  const end = Math.max(start + 1, Math.min(length, Math.ceil(Math.max(range.start, range.end))))
  return { start, end }
}

const normalizeForLog = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return MIN_LOG_VALUE
  }
  return value <= 0 ? MIN_LOG_VALUE : value
}

export const accelerationToDb = (value: number): number => {
  const scaled = Math.min(Math.max(value, MIN_ACC_FOR_DB) * 1000, 1e6)
  return 20 * Math.log10(scaled)
}

export const convertAccelerationSeries = (
  values: number[],
  unit: 'acc' | 'db',
): number[] =>
  values.map((value) =>
    unit === 'acc' ? normalizeForLog(value) : accelerationToDb(value),
  )

const rectangleFilter = (
  spectrum: Complex[],
  low: number,
  high: number,
  sampleRate: number,
): void => {
  const n = spectrum.length
  const frequencyStep = sampleRate / n
  spectrum[0] = complex(0, 0)

  for (let i = 1; i <= n / 2 - 1; i += 1) {
    const frequency = frequencyStep * i
    const keep = frequency >= low && frequency <= high
    if (!keep) {
      spectrum[i] = complex(0, 0)
    }
  }
}

const enforceSymmetry = (spectrum: Complex[]): void => {
  const n = spectrum.length
  for (let i = 1; i < n / 2 - 1; i += 1) {
    const j = n - i
    spectrum[j] = conjugate(spectrum[i])
  }
}

const calculateBandMax = (
  spectrum: Complex[],
  sampleRate: number,
): number[] => {
  return OCTAVE_BANDS.map((band) => {
    const filtered = copyComplexArray(spectrum)
    rectangleFilter(filtered, band.low, band.high, sampleRate)
    enforceSymmetry(filtered)
    const wave = fftInverse(filtered)
    return wave.reduce((max, value) => Math.max(max, Math.abs(value.re)), 0)
  })
}

const runSteadyAnalysis = (
  source: Complex[],
  sampleRate: number,
): SpectralResult => {
  const spectrum = fftForward(copyComplexArray(source))
  const { amplitude, frequency } = serializeAmplitude(spectrum, sampleRate)
  const octaveMax = calculateBandMax(spectrum, sampleRate)

  return {
    octaveMax,
    fftAmplitude: amplitude,
    fftFrequency: frequency,
  }
}

const transferFunction = (frequency: number, vibrationType: VibrationType): Complex => {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return complex(0, 0)
  }

  const pi = Math.PI
  const horizontal = vibrationType === 'horizontal'

  const f1 = horizontal ? 0.4 : 0.8
  const f2 = 100.0
  const q1 = 0.707
  const f3 = horizontal ? 2.0 : 1.5
  const f4 = horizontal ? 2.0 : 5.3
  const q2 = horizontal ? 0.63 : 0.68
  const k = horizontal ? 1.41 : 0.42

  const w = 2 * pi * frequency
  const s = complex(0, w)
  const s2 = mul(s, s)

  const f2pf1 = 2 * pi * f1
  const f2pf2 = 2 * pi * f2
  const f2pf3 = 2 * pi * f3
  const f2pf4 = 2 * pi * f4

  const denomHb1 = add(add(s2, scale(s, f2pf1)), complex(f2pf1 * f2pf1, 0))
  const hb1 = div(s2, denomHb1)

  const denomHb2 = add(
    add(s2, scale(s, f2pf2 / q1)),
    complex(f2pf2 * f2pf2, 0),
  )
  const hb2 = div(complex(f2pf2 * f2pf2, 0), denomHb2)
  const hb = mul(hb1, hb2)

  const denomHw = add(
    add(s2, scale(s, f2pf4 / q2)),
    complex(f2pf4 * f2pf4, 0),
  )
  const hw1 = div(add(s, complex(f2pf3, 0)), denomHw)
  const hw2 = complex((f2pf4 * k * f4) / f3, 0)
  const hw = mul(hw1, hw2)

  return mul(hb, hw)
}

const vibrationWeight = (
  sourceSpectrum: Complex[],
  sampleRate: number,
  vibrationType: VibrationType,
): number[] => {
  const n = sourceSpectrum.length
  const weighted = copyComplexArray(sourceSpectrum)
  const frequencyStep = sampleRate / n
  weighted[0] = complex(0, 0)

  for (let i = 1; i <= n / 2 - 1; i += 1) {
    const frequency = frequencyStep * i
    if (frequency <= 0 || frequency > sampleRate / 2) {
      continue
    }

    const tf = transferFunction(frequency, vibrationType)
    weighted[i] = mul(weighted[i], tf)

    if (i < n / 2) {
      const j = n - i
      weighted[j] = conjugate(weighted[i])
    }
  }

  const timeSeries = fftInverse(weighted)
  return timeSeries.map((value) =>
    Number.isFinite(value.re) ? value.re : 0,
  )
}

interface NonSteadyResult extends SpectralResult {
  vibrationLevel: number[]
  tLv55: number
  tCoefficient: number
}

const runNonSteadyAnalysis = (
  sourceTimeSeries: Complex[],
  sourceWaveLength: number,
  sampleRate: number,
  vibrationType: VibrationType,
): NonSteadyResult => {
  const sourceSpectrum = fftForward(copyComplexArray(sourceTimeSeries))
  const weighted = vibrationWeight(sourceSpectrum, sampleRate, vibrationType)
  const aw = weighted.slice(0, sourceWaveLength).map((value) => value / 100)

  const dt = 1 / sampleRate
  const tau = 0.01
  const a0 = 1e-5
  const ex1 = Math.exp(-dt / tau)
  let aw1 = 0
  const vibrationLevel: number[] = []

  for (const value of aw) {
    const aw2 = value * value
    let aRms = Math.sqrt((aw1 * ex1 + aw2) / 2)
    if (aRms <= a0) {
      aRms = a0
    }

    let lv = 20 * Math.log10(aRms / a0)
    if (!Number.isFinite(lv)) {
      lv = 0
    } else if (lv < -100) {
      lv = -100
    } else if (lv > 200) {
      lv = 200
    }

    vibrationLevel.push(lv)
    aw1 = aw2
  }

  const tLv55 = vibrationLevel.filter((value) => value >= 55).length * dt
  let tCoefficient = 1
  if (tLv55 < 1) {
    tCoefficient = Math.pow(10, -0.25)
  } else if (tLv55 < 10) {
    tCoefficient = Math.pow(10, (Math.log10(tLv55) - 1) / 4)
  }

  const scaled = sourceTimeSeries.map((value) => scale(value, tCoefficient))
  const spectrum = fftForward(copyComplexArray(scaled))
  const { amplitude, frequency } = serializeAmplitude(spectrum, sampleRate)
  const octaveMax = calculateBandMax(spectrum, sampleRate)

  return {
    octaveMax,
    fftAmplitude: amplitude,
    fftFrequency: frequency,
    vibrationLevel,
    tLv55,
    tCoefficient,
  }
}

const getSourceData = (
  wave: number[],
  rangeSelection?: RangeSelection,
): SourceData => {
  if (!rangeSelection) {
    const fftSize = nextPowerOfTwo(wave.length)
    return {
      wave,
      spectrumSource: padRealToComplex(wave, fftSize),
    }
  }

  const range = clampRange(rangeSelection, wave.length)
  const selected = wave.slice(range.start, range.end)
  const fftSize = nextPowerOfTwo(selected.length)

  return {
    wave: selected,
    spectrumSource: padRealToComplex(selected, fftSize),
    selectedRange: range,
  }
}

const resampleWave = (rawWave: number[]): { wave: number[]; time: number[] } => {
  if (!rawWave.length) {
    throw new Error('入力データが空です')
  }

  const timeBase = rawWave.map((_, index) => index * ORIGINAL_SAMPLE_INTERVAL)
  const akima = createAkimaInterpolator(timeBase, rawWave)
  const count = rawWave.length * 2
  const wave: number[] = []
  const time: number[] = []

  for (let i = 0; i < count; i += 1) {
    const t = i / RESAMPLED_RATE
    const value = akima(t)
    wave.push(Number.isFinite(value) ? value : 0)
    time.push(t)
  }

  return { wave, time }
}

export const analyzeWave = (request: AnalysisRequest): AnalysisResult => {
  const { wave: resampledWave, time } = resampleWave(request.rawWave)
  const source = getSourceData(resampledWave, request.rangeSelection)
  const orientation = request.vibrationType === 'horizontal'
    ? 'horizontal'
    : 'vertical'

  const iso = calculateIsoVibrationLevel(
    resampledWave.map((value) => value * 0.01),
    RESAMPLED_RATE,
    0.63,
    orientation,
  )

  if (request.motionType === 'steady') {
    const steady = runSteadyAnalysis(source.spectrumSource, RESAMPLED_RATE)
    return {
      sampleRate: RESAMPLED_RATE,
      motionType: request.motionType,
      vibrationType: request.vibrationType,
      resampledWave,
      resampledTime: time,
      vibrationLevel: iso.vibrationLevel,
      vibrationLevelIso: iso.vibrationLevel,
      octaveBands: OCTAVE_BANDS,
      octaveMax: steady.octaveMax,
      fftFrequency: steady.fftFrequency,
      fftAmplitude: steady.fftAmplitude,
      selectedRange: source.selectedRange,
    }
  }

  const nonSteady = runNonSteadyAnalysis(
    source.spectrumSource,
    source.wave.length,
    RESAMPLED_RATE,
    request.vibrationType,
  )

  return {
    sampleRate: RESAMPLED_RATE,
    motionType: request.motionType,
    vibrationType: request.vibrationType,
    resampledWave,
    resampledTime: time,
    vibrationLevel: nonSteady.vibrationLevel,
    vibrationLevelIso: iso.vibrationLevel,
    octaveBands: OCTAVE_BANDS,
    octaveMax: nonSteady.octaveMax,
    fftFrequency: nonSteady.fftFrequency,
    fftAmplitude: nonSteady.fftAmplitude,
    selectedRange: source.selectedRange,
    tLv55: nonSteady.tLv55,
    tCoefficient: nonSteady.tCoefficient,
  }
}

export const calcWaveDbRange = (
  values: number[],
  motionType: 'steady' | 'non_steady',
): { min: number; max: number } => {
  const valid = values.filter((value) => Number.isFinite(value))
  if (!valid.length) {
    return { min: 0, max: 100 }
  }

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  if (motionType === 'non_steady') {
    const range = Math.max(1, max - min)
    const pad = Math.max(5, range * 0.1)
    const ymin = Math.max(-50, Math.floor((min - pad) / 10) * 10)
    const ymax = Math.min(150, Math.ceil((max + pad) / 10) * 10)
    return { min: ymin, max: Math.max(ymin + 10, ymax) }
  }

  const ymin = min < 40 ? Math.max(0, Math.floor(min / 10) * 10) : 40
  let ymax = Math.ceil(max / 10) * 10
  if (ymax < ymin + 10) {
    ymax = ymin + 10
  }
  return { min: ymin, max: ymax }
}

export const evaluateRelativeError = (expected: number[], actual: number[]): number => {
  const count = Math.min(expected.length, actual.length)
  if (!count) {
    return Number.POSITIVE_INFINITY
  }

  let sum = 0
  for (let i = 0; i < count; i += 1) {
    const denom = Math.max(Math.abs(expected[i]), 1e-12)
    sum += Math.abs(expected[i] - actual[i]) / denom
  }
  return sum / count
}

export const spectrumPeak = (values: number[]): number =>
  values.reduce((max, value) => Math.max(max, magnitude(complex(value, 0))), 0)
