import { useState } from 'react'
import { dashboardStatusLabel } from './dashboardLabels.js'

const WIDTH = 640
const HEIGHT = 248
const PAD = { top: 16, right: 16, bottom: 36, left: 36 }
const STATUS_COLORS = {
  uploaded: '#0878E8',
  processing: '#0F9F9A',
  review_required: '#E8A317',
  partially_converted: '#7C3AED',
  confirmed: '#168A45',
  failed: '#D92D4A',
}

const formatChartDate = (value, withYear = false) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

const axisMax = (value) => Math.ceil(Math.max(4, value) / 4) * 4

const labelIndexes = (length) => {
  if (length <= 6) {
    return Array.from({ length }, (_, index) => index)
  }

  return Array.from(new Set(
    Array.from({ length: 6 }, (_, index) => Math.round((index * (length - 1)) / 5))
  ))
}

const percentShares = (counts) => {
  const total = counts.reduce((sum, value) => sum + value, 0)
  const exact = counts.map((value) => (value / total) * 100)
  const floors = exact.map((value) => Math.floor(value))
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
  const shares = floors.slice()

  for (let index = 0; index < order.length && remainder > 0; index += 1) {
    shares[order[index].index] += 1
    remainder -= 1
  }

  return shares
}

export function OrdersTrendChart({ points }) {
  const [hover, setHover] = useState(null)
  const total = points.reduce((sum, point) => sum + point.count, 0)

  if (total === 0) {
    return <p className="admin-empty">No orders were created in this period.</p>
  }

  const maximum = axisMax(Math.max(...points.map((point) => point.count)))
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom
  const xFor = (index) => PAD.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth)
  const yFor = (value) => PAD.top + innerHeight - (value / maximum) * innerHeight
  const line = points.map((point, index) => `${xFor(index)},${yFor(point.count)}`).join(' ')
  const area = `${xFor(0)},${yFor(0)} ${line} ${xFor(points.length - 1)},${yFor(0)}`
  const ticks = [0, 1, 2, 3, 4].map((step) => (maximum / 4) * step)
  const preferredLabels = new Set(points.flatMap((point, index) => (point.count > 0 ? [index] : [])))
  const labelCandidates = [...new Set([...labelIndexes(points.length), ...preferredLabels])].sort((left, right) => left - right)
  const labels = labelCandidates.reduce((list, index) => {
    const previous = list[list.length - 1]

    if (previous === undefined || xFor(index) - xFor(previous) >= 52) {
      return list.concat(index)
    }

    if (preferredLabels.has(index) && !preferredLabels.has(previous)) {
      return list.slice(0, -1).concat(index)
    }

    return list
  }, [])
  const active = hover === null ? null : points[hover]
  const summary = `${total} ${total === 1 ? 'order' : 'orders'} from ${formatChartDate(points[0].date, true)} to ${formatChartDate(points[points.length - 1].date, true)}`

  const followPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const relative = ((event.clientX - bounds.left) / bounds.width) * WIDTH
    let nearest = 0
    let distance = Number.POSITIVE_INFINITY

    points.forEach((_, index) => {
      const gap = Math.abs(xFor(index) - relative)

      if (gap < distance) {
        distance = gap
        nearest = index
      }
    })

    setHover((current) => (current === nearest ? current : nearest))
  }

  return (
    <div className="admin-chart-frame" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} onPointerMove={followPointer}>
        <polygon points={area} />
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={yFor(tick)} y2={yFor(tick)} />
            <text x={PAD.left - 8} y={yFor(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        <polyline points={line} />
        {labels.map((index) => (
          <text key={points[index].date} x={xFor(index)} y={HEIGHT - 10} textAnchor="middle">
            {formatChartDate(points[index].date)}
          </text>
        ))}
        {active ? <circle cx={xFor(hover)} cy={yFor(active.count)} r="4" /> : null}
      </svg>
      {active ? (
        <div
          className="admin-chart-tip"
          style={{
            left: `${(xFor(hover) / WIDTH) * 100}%`,
            top: `${(yFor(active.count) / HEIGHT) * 100}%`,
          }}
        >
          <strong>{formatChartDate(active.date, true)}</strong>
          <span>{active.count} {active.count === 1 ? 'order' : 'orders'}</span>
        </div>
      ) : null}
      <div className="admin-dash-sr">
        <p>Orders created per day</p>
        <ul>
          {points.map((point) => (
            <li key={point.date}>{formatChartDate(point.date, true)}: {point.count}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function PurchaseOrderStatusChart({ statuses }) {
  const [active, setActive] = useState('')

  const total = statuses.reduce((sum, item) => sum + item.count, 0)

  if (total === 0) {
    return <p className="admin-empty">No purchase orders have been uploaded yet.</p>
  }

  const shares = percentShares(statuses.map((item) => item.count))
  const size = 188
  const stroke = 24
  const radius = 68
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const positive = statuses.filter((item) => item.count > 0)
  const segments = positive.reduce((list, item) => {
    const raw = (item.count / total) * circumference
    const gap = positive.length > 1 && raw > 6 ? 2 : 0
    const start = list.length === 0 ? 0 : list[list.length - 1].end

    return list.concat({
      status: item.status,
      drawn: raw - gap,
      offset: start,
      end: start + raw,
    })
  }, [])
  const summary = statuses.map((item, index) => `${dashboardStatusLabel(item.status)} ${item.count} (${shares[index]}%)`).join(', ')

  return (
    <div className="admin-donut-layout">
      <div className="admin-donut-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} purchase orders. ${summary}`}>
          <g transform={`rotate(-90 ${center} ${center})`}>
            {segments.map((segment) => (
              <circle
                key={segment.status}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={STATUS_COLORS[segment.status] || '#64748B'}
                strokeWidth={active === segment.status ? stroke + 4 : stroke}
                strokeDasharray={segments.length === 1 ? `${circumference} ${circumference}` : `${segment.drawn} ${circumference - segment.drawn}`}
                strokeDashoffset={-segment.offset}
                onPointerEnter={() => setActive(segment.status)}
                onPointerLeave={() => setActive('')}
              >
                <title>{dashboardStatusLabel(segment.status)}</title>
              </circle>
            ))}
          </g>
          <text x={center} y={center - 4} textAnchor="middle">{total}</text>
          <text x={center} y={center + 18} textAnchor="middle">POs</text>
        </svg>
      </div>
      <ul className="admin-donut-legend">
        {statuses.map((item, index) => (
          <li key={item.status} className={item.count === 0 ? 'is-zero' : undefined} title={`${dashboardStatusLabel(item.status)}: ${item.count} (${shares[index]}%)`}>
            <span style={{ background: STATUS_COLORS[item.status] || '#64748B' }} />
            <strong>{dashboardStatusLabel(item.status)}</strong>
            <small>{item.count} ({shares[index]}%)</small>
          </li>
        ))}
      </ul>
    </div>
  )
}
