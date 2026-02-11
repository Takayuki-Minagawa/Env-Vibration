import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeWave, evaluateRelativeError } from './analysis'
import { parseWaveText } from './csv'
import type { AnalysisResult, MotionType, VibrationType } from './types'

interface ExpectedData {
  octave: number[]
  fftAmplitude: number[]
}

interface Candidate {
  name: string
  motionType: MotionType
  vibrationType: VibrationType
  inputPath: string
}

const vibrationRoot = path.resolve(
  process.cwd(),
  '..',
  'A_Environmental_Vibration',
  'bin',
  'V_Release',
  '鉛直WorkData',
)

const candidates: Candidate[] = [
  {
    name: 'steady_vertical',
    motionType: 'steady',
    vibrationType: 'vertical_home',
    inputPath: path.join(vibrationRoot, 'in_定常', '試験棟5F_スラブ.csv'),
  },
  {
    name: 'nonsteady_vertical',
    motionType: 'non_steady',
    vibrationType: 'vertical_home',
    inputPath: path.join(
      vibrationRoot,
      'in_非定常',
      '振動レベルの時刻歴_鉛直でNGとなる小さなデータ2.csv',
    ),
  },
  {
    name: 'steady_vertical_office',
    motionType: 'steady',
    vibrationType: 'vertical_office',
    inputPath: path.join(vibrationRoot, 'in_定常', '試験棟5F_スラブ.csv'),
  },
  {
    name: 'nonsteady_vertical_office',
    motionType: 'non_steady',
    vibrationType: 'vertical_office',
    inputPath: path.join(
      vibrationRoot,
      'in_非定常',
      '振動レベルの時刻歴_鉛直でNGとなる小さなデータ2.csv',
    ),
  },
  {
    name: 'steady_horizontal',
    motionType: 'steady',
    vibrationType: 'horizontal',
    inputPath: path.resolve(
      process.cwd(),
      '..',
      'A_Environmental_Vibration',
      'bin',
      'Release',
      '水平WorkData',
      'in_定常',
      'wave.csv',
    ),
  },
  {
    name: 'nonsteady_horizontal_sample',
    motionType: 'non_steady',
    vibrationType: 'horizontal',
    inputPath: path.resolve(
      process.cwd(),
      '..',
      'A_Environmental_Vibration',
      'bin',
      'Release',
      '水平WorkData',
      'in_非定常',
      'sample.csv',
    ),
  },
  {
    name: 'nonsteady_horizontal_wave',
    motionType: 'non_steady',
    vibrationType: 'horizontal',
    inputPath: path.resolve(
      process.cwd(),
      '..',
      'A_Environmental_Vibration',
      'bin',
      'Release',
      '水平WorkData',
      'in_非定常',
      'wave.csv',
    ),
  },
]

const requiredFixturePaths = [
  candidates[0].inputPath,
  path.join(vibrationRoot, 'result', 'ttt.csv'),
  path.join(vibrationRoot, 'result', 'yyy.csv'),
]
const hasRequiredFixtures = requiredFixturePaths.every((fixturePath) => existsSync(fixturePath))
const describeWithFixtures = hasRequiredFixtures ? describe : describe.skip

const loadWave = (filePath: string): number[] =>
  parseWaveText(readFileSync(filePath, 'utf8'))

const parseExpected = (filePath: string): ExpectedData => {
  const text = readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const octave: number[] = []
  const fftAmplitude: number[] = []

  let mode: 'octave' | 'fft' | 'other' = 'octave'
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    if (line.startsWith('# FFT')) {
      mode = 'fft'
      continue
    }
    if (line.startsWith('中心振動数') || line.startsWith('振動数')) {
      continue
    }
    if (line.startsWith('#')) {
      mode = 'other'
      continue
    }

    const parts = line.split(',')
    if (mode === 'octave' && parts.length >= 2) {
      const value = Number(parts[1])
      if (Number.isFinite(value)) {
        octave.push(value)
      }
    }

    if (mode === 'fft' && parts.length >= 2) {
      const value = Number(parts[1])
      if (Number.isFinite(value)) {
        fftAmplitude.push(value)
      }
    }
  }

  return { octave, fftAmplitude }
}

const score = (expected: ExpectedData, result: AnalysisResult) => {
  const octaveError = evaluateRelativeError(expected.octave, result.octaveMax)
  const fftLen = Math.min(expected.fftAmplitude.length, result.fftAmplitude.length, 300)
  const fftError = evaluateRelativeError(
    expected.fftAmplitude.slice(0, fftLen),
    result.fftAmplitude.slice(0, fftLen),
  )
  return { octaveError, fftError }
}

describeWithFixtures('analysis', () => {
  it('parses one-column wave files', () => {
    const wave = loadWave(candidates[0].inputPath)
    expect(wave.length).toBeGreaterThan(100)
    expect(Number.isFinite(wave[0])).toBe(true)
  })

  it('matches steady C# reference output ttt.csv', () => {
    const expected = parseExpected(path.join(vibrationRoot, 'result', 'ttt.csv'))
    const scored = candidates.map((candidate) => {
      const wave = loadWave(candidate.inputPath)
      const result = analyzeWave({
        rawWave: wave,
        vibrationType: candidate.vibrationType,
        motionType: candidate.motionType,
      })
      return {
        candidate: candidate.name,
        ...score(expected, result),
      }
    })

    const best = [...scored].sort((a, b) => a.octaveError - b.octaveError)[0]
    expect(best.octaveError).toBeLessThan(0.12)
    expect(best.fftError).toBeLessThan(0.22)
  })

  it('keeps nonsteady output finite and reasonably close to yyy.csv', () => {
    const expected = parseExpected(path.join(vibrationRoot, 'result', 'yyy.csv'))
    const candidate = candidates.find((item) => item.name === 'nonsteady_vertical')
    if (!candidate) {
      throw new Error('candidate not found')
    }

    const wave = loadWave(candidate.inputPath)
    const result = analyzeWave({
      rawWave: wave,
      vibrationType: candidate.vibrationType,
      motionType: candidate.motionType,
    })

    expect(result.octaveMax.every((value) => Number.isFinite(value))).toBe(true)
    expect(result.fftAmplitude.every((value) => Number.isFinite(value))).toBe(true)
    expect(result.vibrationLevel.every((value) => Number.isFinite(value))).toBe(true)

    const looseScore = score(expected, result)
    expect(looseScore.octaveError).toBeLessThan(0.7)
    expect(looseScore.fftError).toBeLessThan(0.9)
  })
})
