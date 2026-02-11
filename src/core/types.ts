export type VibrationType = 'horizontal' | 'vertical_home' | 'vertical_office'
export type MotionType = 'steady' | 'non_steady'
export type AxisUnit = 'acc' | 'db'

export interface RangeSelection {
  start: number
  end: number
}

export interface OctaveBand {
  center: number
  low: number
  high: number
}

export interface AnalysisRequest {
  rawWave: number[]
  vibrationType: VibrationType
  motionType: MotionType
  rangeSelection?: RangeSelection
}

export interface AnalysisResult {
  sampleRate: number
  motionType: MotionType
  vibrationType: VibrationType
  resampledWave: number[]
  resampledTime: number[]
  vibrationLevel: number[]
  vibrationLevelIso: number[]
  octaveBands: OctaveBand[]
  octaveMax: number[]
  fftFrequency: number[]
  fftAmplitude: number[]
  selectedRange?: RangeSelection
  tLv55?: number
  tCoefficient?: number
}
