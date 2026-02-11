import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { Line } from 'react-chartjs-2'
import {
  analyzeWave,
  buildGuidelines,
  calcWaveDbRange,
  convertAccelerationSeries,
  decodeUploadedFile,
  formatAnalysisCsv,
  parseWaveText,
  type AnalysisResult,
  type AxisUnit,
  type MotionType,
  type RangeSelection,
  type VibrationType,
} from './core'
import { downloadTextFile } from './utils/download'
import './App.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
)

const MAX_DRAW_POINTS = 12_000

const toRangeLabel = (
  range: RangeSelection | undefined,
  sampleRate: number,
): string => {
  if (!range) {
    return '全区間'
  }
  const start = (range.start / sampleRate).toFixed(2)
  const end = (range.end / sampleRate).toFixed(2)
  return `${start}s - ${end}s`
}

const sameRange = (
  lhs: RangeSelection | undefined,
  rhs: RangeSelection | undefined,
): boolean => lhs?.start === rhs?.start && lhs?.end === rhs?.end

function App() {
  const waveChartRef = useRef<ChartJS<'line'>>(null)

  const [fileName, setFileName] = useState('')
  const [rawWave, setRawWave] = useState<number[]>([])
  const [vibrationType, setVibrationType] = useState<VibrationType>('horizontal')
  const [motionType, setMotionType] = useState<MotionType>('steady')
  const [chartUnit, setChartUnit] = useState<AxisUnit>('acc')
  const [waveUnit, setWaveUnit] = useState<AxisUnit>('acc')
  const [showFft, setShowFft] = useState(false)
  const [selectedRange, setSelectedRange] = useState<RangeSelection | undefined>()
  const [fullResult, setFullResult] = useState<AnalysisResult | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!rawWave.length) {
      setResult(null)
      setFullResult(null)
      return
    }

    setIsAnalyzing(true)
    try {
      const base = analyzeWave({
        rawWave,
        vibrationType,
        motionType,
      })
      const ranged = selectedRange
        ? analyzeWave({
            rawWave,
            vibrationType,
            motionType,
            rangeSelection: selectedRange,
          })
        : base

      setFullResult(base)
      setResult(ranged)
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : '解析に失敗しました'
      setError(message)
      setFullResult(null)
      setResult(null)
    } finally {
      setIsAnalyzing(false)
    }
  }, [rawWave, vibrationType, motionType, selectedRange])

  const handleFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const target = event.target.files?.[0]
    if (!target) {
      return
    }

    try {
      const text = await decodeUploadedFile(target)
      const parsed = parseWaveText(text)
      if (!parsed.length) {
        throw new Error('数値データを読み取れませんでした')
      }
      setRawWave(parsed)
      setFileName(target.name)
      setSelectedRange(undefined)
      setError('')
      waveChartRef.current?.resetZoom()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ファイル読み込みに失敗しました'
      setError(message)
      setRawWave([])
      setFullResult(null)
      setResult(null)
    } finally {
      event.target.value = ''
    }
  }

  const wavePoints = useMemo(() => {
    if (!fullResult) {
      return [] as { x: number; y: number }[]
    }

    const source =
      waveUnit === 'acc' ? fullResult.resampledWave : fullResult.vibrationLevel
    const stride = Math.max(1, Math.ceil(source.length / MAX_DRAW_POINTS))
    const points: { x: number; y: number }[] = []
    for (let i = 0; i < source.length; i += stride) {
      points.push({ x: i / fullResult.sampleRate, y: source[i] })
    }
    return points
  }, [fullResult, waveUnit])

  const waveDbRange = useMemo(() => {
    if (!fullResult) {
      return { min: 0, max: 100 }
    }
    return calcWaveDbRange(fullResult.vibrationLevel, fullResult.motionType)
  }, [fullResult])

  const waveChartData = useMemo<ChartData<'line'>>(
    () => ({
      datasets: [
        {
          label: waveUnit === 'acc' ? '加速度' : '振動レベル',
          data: wavePoints,
          parsing: false,
          borderColor: '#0c7fa6',
          borderWidth: 1.4,
          pointRadius: 0,
          fill: false,
        },
      ],
    }),
    [wavePoints, waveUnit],
  )

  const waveChartOptions = useMemo<ChartOptions<'line'>>(() => {
    const maxTime = fullResult
      ? (fullResult.resampledWave.length - 1) / fullResult.sampleRate
      : 1
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '時間 [s]' },
          min: 0,
          max: maxTime,
        },
        y: {
          type: 'linear',
          title: {
            display: true,
            text: waveUnit === 'acc' ? '加速度 [gal]' : '振動レベル [dB]',
          },
          min: waveUnit === 'db' ? waveDbRange.min : undefined,
          max: waveUnit === 'db' ? waveDbRange.max : undefined,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'nearest', intersect: false },
        zoom: {
          limits: {
            x: { min: 0, max: maxTime },
          },
          pan: { enabled: false, mode: 'x' },
          zoom: {
            mode: 'x',
            drag: {
              enabled: true,
              backgroundColor: 'rgba(12, 127, 166, 0.15)',
              borderColor: 'rgba(12, 127, 166, 0.45)',
              borderWidth: 1,
            },
            wheel: { enabled: false },
            pinch: { enabled: false },
            onZoomComplete: ({ chart }: { chart: ChartJS<'line'> }) => {
              if (!fullResult) {
                return
              }
              const xScale = chart.scales.x
              const fullStart = 0
              const fullEnd = maxTime
              const epsilon = 1e-6
              if (
                Math.abs(xScale.min - fullStart) < epsilon &&
                Math.abs(xScale.max - fullEnd) < epsilon
              ) {
                if (selectedRange) {
                  setSelectedRange(undefined)
                }
                return
              }

              const start = Math.max(
                0,
                Math.floor(xScale.min * fullResult.sampleRate),
              )
              const end = Math.min(
                fullResult.resampledWave.length,
                Math.ceil(xScale.max * fullResult.sampleRate),
              )
              if (end - start < 2) {
                return
              }
              const nextRange = { start, end }
              if (!sameRange(selectedRange, nextRange)) {
                setSelectedRange(nextRange)
              }
            },
          },
        } as never,
      },
    }
  }, [fullResult, selectedRange, waveDbRange, waveUnit])

  const evaluationChartData = useMemo<ChartData<'line'>>(() => {
    if (!result) {
      return { datasets: [] }
    }

    const datasets: ChartData<'line'>['datasets'] = []
    const octaveY = convertAccelerationSeries(result.octaveMax, chartUnit)
    datasets.push({
      label: '1/3 Octave',
      data: result.octaveBands.map((band, index) => ({
        x: band.center,
        y: octaveY[index],
      })),
      parsing: false,
      borderColor: '#127ca2',
      borderWidth: 2.2,
      pointStyle: 'rectRot',
      pointRadius: 4,
      fill: false,
    })

    if (showFft) {
      const fftY = convertAccelerationSeries(result.fftAmplitude, chartUnit)
      datasets.push({
        label: 'FFT Amp',
        data: result.fftFrequency.map((frequency, index) => ({
          x: frequency,
          y: fftY[index],
        })),
        parsing: false,
        borderColor: '#1f2933',
        borderWidth: 1.2,
        pointRadius: 0,
        fill: false,
      })
    }

    buildGuidelines(vibrationType).forEach((guide) => {
      const guideY = convertAccelerationSeries(guide.acceleration, chartUnit)
      datasets.push({
        label: guide.name,
        data: guide.x.map((x, index) => ({ x, y: guideY[index] })),
        parsing: false,
        borderColor: guide.color,
        borderDash: [4, 4],
        borderWidth: 1.1,
        pointRadius: 0,
        fill: false,
      })
    })

    return { datasets }
  }, [chartUnit, result, showFft, vibrationType])

  const evaluationChartOptions = useMemo<ChartOptions<'line'>>(() => {
    const isAcc = chartUnit === 'acc'
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: 'logarithmic',
          min: 1,
          max: 30,
          title: { display: true, text: '振動数 [Hz]' },
        },
        y: {
          type: isAcc ? 'logarithmic' : 'linear',
          min: isAcc ? 0.01 : vibrationType === 'horizontal' ? 30 : 50,
          max: isAcc ? 100 : vibrationType === 'horizontal' ? 80 : 100,
          title: {
            display: true,
            text: isAcc ? '加速度(0-p) [gal]' : '振動レベル [dB]',
          },
        },
      },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: { mode: 'nearest', intersect: false },
      },
    }
  }, [chartUnit, vibrationType])

  const handleResetRange = (): void => {
    setSelectedRange(undefined)
    waveChartRef.current?.resetZoom()
  }

  const saveCsv = (): void => {
    if (!result) {
      return
    }
    const stem = fileName.replace(/\.[^.]+$/, '') || 'analysis'
    const csv = formatAnalysisCsv(result, true)
    downloadTextFile(
      csv,
      `${stem}_${vibrationType}_${motionType}.csv`,
      'text/csv;charset=utf-8',
    )
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>環境振動評価 Web Analyzer</h1>
        <p>
          Windows Forms 版の計算仕様を基準に、ブラウザ内で解析を実行します。
        </p>
      </header>

      <section className="panel controls">
        <div className="control-group">
          <label className="label">入力ファイル</label>
          <input type="file" accept=".csv,.txt" onChange={handleFile} />
          <span className="hint">
            {fileName || '未選択'} / 生データ点数: {rawWave.length.toLocaleString()}
          </span>
          <span className="hint">
            波形グラフ上でドラッグズームすると解析範囲に反映されます
          </span>
        </div>

        <div className="grid">
          <label>
            振動タイプ
            <select
              value={vibrationType}
              onChange={(event) =>
                setVibrationType(event.target.value as VibrationType)
              }
            >
              <option value="horizontal">水平</option>
              <option value="vertical_home">鉛直（住宅）</option>
              <option value="vertical_office">鉛直（事務所）</option>
            </select>
          </label>

          <label>
            振動種別
            <select
              value={motionType}
              onChange={(event) => setMotionType(event.target.value as MotionType)}
            >
              <option value="steady">定常</option>
              <option value="non_steady">非定常</option>
            </select>
          </label>

          <label>
            評価図の縦軸
            <select
              value={chartUnit}
              onChange={(event) => setChartUnit(event.target.value as AxisUnit)}
            >
              <option value="acc">加速度</option>
              <option value="db">dB</option>
            </select>
          </label>

          <label>
            波形の縦軸
            <select
              value={waveUnit}
              onChange={(event) => setWaveUnit(event.target.value as AxisUnit)}
            >
              <option value="acc">加速度</option>
              <option value="db">dB</option>
            </select>
          </label>
        </div>

        <div className="control-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showFft}
              onChange={(event) => setShowFft(event.target.checked)}
            />
            FFT重ね表示
          </label>
          <button type="button" onClick={handleResetRange}>
            範囲選択を解除
          </button>
          <button type="button" onClick={saveCsv} disabled={!result}>
            CSV保存
          </button>
        </div>

        {result && (
          <div className="status-line">
            <span>解析点数: {result.resampledWave.length.toLocaleString()}</span>
            <span>解析範囲: {toRangeLabel(result.selectedRange, result.sampleRate)}</span>
            {result.motionType === 'non_steady' && (
              <span>
                tLv55: {(result.tLv55 ?? 0).toFixed(3)}s / 補正係数:{' '}
                {(result.tCoefficient ?? 0).toFixed(4)}
              </span>
            )}
          </div>
        )}

        {isAnalyzing && <p className="hint">解析中...</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel chart-area">
        <div className="chart-wrap">
          <Line ref={waveChartRef} data={waveChartData} options={waveChartOptions} />
        </div>
      </section>

      <section className="panel chart-area">
        <div className="chart-wrap">
          <Line data={evaluationChartData} options={evaluationChartOptions} />
        </div>
      </section>
    </main>
  )
}

export default App
