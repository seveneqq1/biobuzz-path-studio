import { Gauge, Info, MapPin, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { Interpolation, SegmentDecision, Waypoint } from '../types'
import { clamp } from '../lib/geometry'

interface Props {
  point: Waypoint | null
  index: number
  decision: SegmentDecision | null
  onChange: (changes: Partial<Waypoint>) => void
  onDelete: () => void
}

const interpolationOptions: { value: Interpolation; label: string }[] = [
  { value: 'auto', label: 'Auto select' },
  { value: 'linear', label: 'Linear' },
  { value: 'constant', label: 'Constant' },
  { value: 'tangent', label: 'Tangent' },
  { value: 'piecewise', label: 'Piecewise' },
]

export function Inspector({ point, index, decision, onChange, onDelete }: Props) {
  if (!point) return <div className="inspector-empty">
    <div className="empty-orbit"><MapPin size={23} /></div>
    <h3>No waypoint selected</h3>
    <p>Select a node on the field to tune its pose and arrival heading.</p>
  </div>

  const numberChange = (key: 'x' | 'y' | 'heading' | 'controlWeight', value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    const safe = key === 'heading' ? clamp(parsed, 0, 360)
      : key === 'controlWeight' ? clamp(parsed, .25, 1.75)
      : clamp(parsed, 0, 144)
    onChange({ [key]: safe })
  }

  return <div className="inspector-content">
    <div className="inspector-heading">
      <div><span>Waypoint {index + 1}</span><h2>Pose inspector</h2></div>
      <button className="icon-danger" onClick={onDelete} aria-label="Delete waypoint" title="Delete waypoint"><Trash2 size={17} /></button>
    </div>

    <div className="field-group">
      <div className="group-title"><MapPin size={15} /><span>Field position</span><small>inches</small></div>
      <div className="input-grid">
        <label><span>X</span><input type="number" min="0" max="144" step="0.1" value={Number(point.x.toFixed(1))} onChange={e => numberChange('x', e.target.value)} /></label>
        <label><span>Y</span><input type="number" min="0" max="144" step="0.1" value={Number(point.y.toFixed(1))} onChange={e => numberChange('y', e.target.value)} /></label>
      </div>
    </div>

    <div className="field-group">
      <div className="group-title"><RotateCw size={15} /><span>Target heading</span><small>degrees</small></div>
      <div className="heading-control">
        <input className="heading-range" type="range" min="0" max="360" value={point.heading} onChange={e => numberChange('heading', e.target.value)} />
        <label><input type="number" min="0" max="360" value={Number(point.heading.toFixed(1))} onChange={e => numberChange('heading', e.target.value)} /><span>°</span></label>
      </div>
      <div className="heading-compass" aria-hidden="true">
        {[0, 90, 180, 270].map(deg => <i key={deg} style={{ transform: `rotate(${-deg}deg)` }}>{deg}°</i>)}
      </div>
    </div>

    <div className="field-group">
      <div className="group-title"><SlidersHorizontal size={15} /><span>Arrival interpolation</span>{index === 0 && <small>start node</small>}</div>
      <select value={point.interpolation} disabled={index === 0} onChange={e => onChange({ interpolation: e.target.value as Interpolation })}>
        {interpolationOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {index > 0 && decision && <div className={`decision-note ${point.interpolation !== 'auto' ? 'manual' : ''}`}>
        <Info size={15} />
        <div><strong>{point.interpolation === 'auto' ? `Optimizer chose ${decision.type}` : `${decision.type} override`}</strong><p>{decision.reason}</p></div>
      </div>}
    </div>

    <div className="field-group">
      <div className="group-title"><Gauge size={15} /><span>Bézier tension</span><small>{point.controlWeight.toFixed(2)}×</small></div>
      <input className="weight-range" type="range" min="0.25" max="1.75" step="0.05" value={point.controlWeight} onChange={e => numberChange('controlWeight', e.target.value)} />
      <div className="range-labels"><span>Tighter</span><span>Longer handles</span></div>
    </div>
  </div>
}
