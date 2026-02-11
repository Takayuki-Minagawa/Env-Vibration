import type { OctaveBand } from './types'

export const ORIGINAL_SAMPLE_INTERVAL = 0.01
export const RESAMPLED_RATE = 200
export const MAX_INPUT_LINES = 2_000_000
export const MIN_LOG_VALUE = 1e-4
export const MIN_ACC_FOR_DB = 1e-9

export const OCTAVE_CENTERS = [
  0.8,
  1.0,
  1.25,
  1.6,
  2.0,
  2.5,
  3.15,
  4.0,
  5.0,
  6.3,
  8.0,
  10.0,
  12.5,
  16.0,
  20.0,
  25.0,
  31.5,
  40.0,
  50.0,
  63.0,
  80.0,
]

const OCTAVE_DIVIDER = Math.pow(2, 1 / 6)

export const OCTAVE_BANDS: OctaveBand[] = OCTAVE_CENTERS.map((center) => ({
  center,
  low: center / OCTAVE_DIVIDER,
  high: center * OCTAVE_DIVIDER,
}))
