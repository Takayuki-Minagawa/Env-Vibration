import {
  add,
  complex,
  copyComplexArray,
  magnitude,
  mul,
  scale,
  sub,
  type Complex,
} from './complex'

export const nextPowerOfTwo = (value: number): number => {
  let n = 1
  while (n < value) {
    n *= 2
  }
  return n
}

export const isPowerOfTwo = (value: number): boolean =>
  value > 0 && (value & (value - 1)) === 0

const bitReverseIndex = (value: number, bits: number): number => {
  let reversed = 0
  let target = value
  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | (target & 1)
    target >>= 1
  }
  return reversed
}

const fftInternal = (input: Complex[], inverse: boolean): Complex[] => {
  const n = input.length
  if (!isPowerOfTwo(n)) {
    throw new Error(`FFT length must be power of two. got=${n}`)
  }

  const output = copyComplexArray(input)
  const bits = Math.log2(n)

  for (let i = 0; i < n; i += 1) {
    const j = bitReverseIndex(i, bits)
    if (j > i) {
      const tmp = output[i]
      output[i] = output[j]
      output[j] = tmp
    }
  }

  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2
    const angleBase = (inverse ? 2 : -2) * Math.PI / size

    for (let start = 0; start < n; start += size) {
      for (let i = 0; i < half; i += 1) {
        const evenIndex = start + i
        const oddIndex = evenIndex + half
        const even = output[evenIndex]
        const odd = output[oddIndex]
        const angle = angleBase * i
        const twiddle = complex(Math.cos(angle), Math.sin(angle))
        const term = mul(odd, twiddle)

        output[evenIndex] = add(even, term)
        output[oddIndex] = sub(even, term)
      }
    }
  }

  if (!inverse) {
    return output
  }

  const scaleFactor = 1 / n
  return output.map((value) => scale(value, scaleFactor))
}

export const fftForward = (input: Complex[]): Complex[] =>
  fftInternal(input, false)

export const fftInverse = (input: Complex[]): Complex[] =>
  fftInternal(input, true)

export const padRealToComplex = (source: number[], n: number): Complex[] => {
  const output = Array.from({ length: n }, () => complex(0, 0))
  source.forEach((value, index) => {
    if (index < n) {
      output[index] = complex(value, 0)
    }
  })
  return output
}

export const serializeAmplitude = (
  spectrum: Complex[],
  sampleRate: number,
): { amplitude: number[]; frequency: number[] } => {
  const dt = 1 / sampleRate
  const n = spectrum.length
  const frequency: number[] = []
  const amplitude: number[] = []

  for (let i = 0; i < n / 2; i += 1) {
    amplitude.push(magnitude(spectrum[i]) * dt)
    frequency.push((i + 1) / (n * dt))
  }

  return { amplitude, frequency }
}
