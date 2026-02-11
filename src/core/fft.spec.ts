import { describe, expect, it } from 'vitest'
import { complex, type Complex } from './complex'
import { fftForward, fftInverse } from './fft'

describe('fft', () => {
  it('inverse( forward(x) ) reproduces x', () => {
    const source: Complex[] = [
      complex(0.5, 0),
      complex(1.2, -0.4),
      complex(-0.7, 0.3),
      complex(0.1, 0),
      complex(2.5, -1.1),
      complex(-1.8, 0.9),
      complex(0.4, -0.2),
      complex(0.9, 0),
    ]

    const spectrum = fftForward(source)
    const restored = fftInverse(spectrum)

    restored.forEach((value, index) => {
      expect(value.re).toBeCloseTo(source[index].re, 9)
      expect(value.im).toBeCloseTo(source[index].im, 9)
    })
  })
})
