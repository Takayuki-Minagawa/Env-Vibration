export interface Complex {
  re: number
  im: number
}

export const complex = (re = 0, im = 0): Complex => ({ re, im })

export const add = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
})

export const sub = (a: Complex, b: Complex): Complex => ({
  re: a.re - b.re,
  im: a.im - b.im,
})

export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
})

export const div = (a: Complex, b: Complex): Complex => {
  const denom = b.re * b.re + b.im * b.im
  if (denom === 0) {
    return complex(0, 0)
  }

  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  }
}

export const scale = (a: Complex, factor: number): Complex => ({
  re: a.re * factor,
  im: a.im * factor,
})

export const conjugate = (a: Complex): Complex => ({
  re: a.re,
  im: -a.im,
})

export const magnitude = (a: Complex): number =>
  Math.sqrt(a.re * a.re + a.im * a.im)

export const copyComplexArray = (src: Complex[]): Complex[] =>
  src.map((value) => complex(value.re, value.im))
