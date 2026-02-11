import type { VibrationType } from './types'

export interface GuidelineSeries {
  name: string
  color: string
  x: number[]
  acceleration: number[]
}

export const buildGuidelines = (
  vibrationType: VibrationType,
): GuidelineSeries[] => {
  const names = ['H-I', 'H-II', 'H-III', 'H-IV', 'H-V', 'H-VI']
  const colors = ['#0b6f8c', '#0b6f8c', '#0b6f8c', '#c13d1f', '#c13d1f', '#c13d1f']

  if (vibrationType === 'horizontal') {
    const ff = [1, 1.5, 2.5, 30]
    return names.map((name, index) => {
      const values = ff.map((f) => {
        if (f < 1.5) {
          const coeff = [1.3, 1.63, 2.06, 3.26, 6.51, 16.3][index]
          return coeff * Math.pow(f, -0.5)
        }
        if (f < 2.5) {
          return [1.06, 1.33, 1.68, 2.66, 5.31, 13.3][index]
        }
        const coeff = [0.509, 0.641, 0.807, 1.28, 2.55, 6.41][index]
        return coeff * Math.pow(f, 0.8)
      })

      return {
        name,
        color: colors[index],
        x: ff,
        acceleration: values,
      }
    })
  }

  const ff = [3, 8, 30]
  const isHouse = vibrationType === 'vertical_home'
  const lowHouse = [0.808, 2.0, 2.83, 4.0, 5.66, 8.0]
  const lowOffice = [0.808, 2.52, 3.56, 5.04, 7.12, 10.1]
  const highHouse = [0.101, 0.25, 0.354, 0.5, 0.707, 1.0]
  const highOffice = [0.101, 0.315, 0.445, 0.629, 0.89, 1.26]

  return names.map((name, index) => {
    const values = ff.map((f) => {
      if (f < 8) {
        return (isHouse ? lowHouse : lowOffice)[index]
      }
      return (isHouse ? highHouse : highOffice)[index] * f
    })

    return {
      name,
      color: colors[index],
      x: ff,
      acceleration: values,
    }
  })
}
