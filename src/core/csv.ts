import { MAX_INPUT_LINES, MIN_ACC_FOR_DB } from './constants'
import type { AnalysisResult } from './types'

export const decodeUploadedFile = async (file: File): Promise<string> => {
  const raw = new Uint8Array(await file.arrayBuffer())
  const encodings = ['shift_jis', 'utf-8']

  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true })
      return decoder.decode(raw)
    } catch {
      // noop
    }
  }

  return new TextDecoder().decode(raw)
}

const parseFirstNumber = (line: string): number | null => {
  const trimmed = line.trim().replace(/^\ufeff/, '')
  if (!trimmed) {
    return null
  }

  const direct = Number(trimmed)
  if (Number.isFinite(direct)) {
    return direct
  }

  const tokens = trimmed.split(/[,\t;\s]+/)
  for (const token of tokens) {
    const value = Number(token)
    if (Number.isFinite(value)) {
      return value
    }
  }

  return null
}

export const parseWaveText = (text: string): number[] => {
  const lines = text.split(/\r?\n/)
  const data: number[] = []

  for (const line of lines) {
    const value = parseFirstNumber(line)
    if (value !== null) {
      data.push(value)
      if (data.length >= MAX_INPUT_LINES) {
        break
      }
    }
  }

  return data
}

const accelerationToDb = (acc: number): number =>
  20 * Math.log10(Math.max(acc, MIN_ACC_FOR_DB) * 1000)

export const formatAnalysisCsv = (
  result: AnalysisResult,
  includeWaveHistory = true,
): string => {
  const rows: string[] = []
  rows.push('中心振動数[Hz],最大加速度[gal],振動レベル[dB]')

  result.octaveBands.forEach((band, index) => {
    const acc = result.octaveMax[index] ?? 0
    rows.push(`${band.center},${acc},${accelerationToDb(acc)}`)
  })

  rows.push('')
  rows.push('# FFT')
  rows.push('振動数[Hz],フーリエ振幅[gal・sec]')
  result.fftFrequency.forEach((frequency, index) => {
    rows.push(`${frequency},${result.fftAmplitude[index] ?? 0}`)
  })

  if (includeWaveHistory) {
    rows.push('')
    rows.push('# 振動レベルの時刻歴')
    rows.push('時刻[s],振動レベルの時刻歴[dB]')

    let n = 0
    for (let i = 0; i < result.vibrationLevel.length; i += 2) {
      const time = (n * 0.01).toFixed(2)
      const value = (result.vibrationLevel[i] ?? 0).toFixed(3)
      rows.push(`${time},${value}`)
      n += 1
    }
  }

  return rows.join('\r\n')
}
