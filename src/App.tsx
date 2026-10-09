import { useMemo, useState } from 'react'
import { Bug, Download, Hexagon, Route, RotateCcw, Sparkles, Undo2 } from 'lucide-react'
import { FieldCanvas } from './components/FieldCanvas'
import { Inspector } from './components/Inspector'
import { CodePanel } from './components/CodePanel'
import { editWaypoint, seedWaypoints } from './lib/geometry'
import { optimizeCurves } from './lib/curveFit'
import { analyzePath } from './lib/optimizer'
import { downloadJava, generateJava } from './lib/codegen'
import type { CanvasTool, Waypoint } from './types'

export default function App() {
  const [points, setPoints] = useState<Waypoint[]>(seedWaypoints)
  const [history, setHistory] = useState<Waypoint[][]>([])
  const [selectedId, setSelectedId] = useState<string | null>(points[1]?.id ?? null)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [snap, setSnap] = useState(false)
  const [optimized, setOptimized] = useState(false)
  const [pathOptimizationLabel, setPathOptimizationLabel] = useState('Optimize path')
  const decisions = useMemo(() => analyzePath(points), [points])
  const code = useMemo(() => generateJava(points, decisions), [points, decisions])
  const selectedIndex = points.findIndex(point => point.id === selectedId)
  const selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null
  const selectedDecision = selectedIndex > 0 ? decisions[selectedIndex - 1] : null

  const updatePoints = (next: Waypoint[]) => {
    setHistory(current => [...current.slice(-19), points])
    setPoints(next)
    setOptimized(false)
  }
  const updateSelected = (changes: Partial<Waypoint>) => {
    if (!selectedId) return
    updatePoints(editWaypoint(points,selectedId,changes))
  }
  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setPoints(previous)
    setHistory(current => current.slice(0, -1))
  }
  const optimize = () => {
    updatePoints(points.map((point, index) => index === 0 ? point : { ...point, interpolation: 'auto' }))
    setOptimized(true)
    window.setTimeout(() => setOptimized(false), 1700)
  }
  const optimizePath = () => {
    const before = points.length
    const next = optimizeCurves(points)
    updatePoints(next)
    setPathOptimizationLabel(next.length < before ? `${before} → ${next.length} points` : 'Already minimal')
    window.setTimeout(() => setPathOptimizationLabel('Optimize path'), 2000)
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><Hexagon size={25} /><Bug size={14} /></div>
        <div><h1>BIOBUZZ <span>Path Studio</span></h1><p>FTC autonomous workbench</p></div>
      </div>
      <div className="header-controls">
        <span className="season-select">2026–27 field</span>
        <button className="secondary-button path-optimize-button" onClick={optimizePath}><Route size={16} />{pathOptimizationLabel}</button>
        <button className="secondary-button interpolation-optimize-button" aria-label="Optimize interpolations" onClick={optimize}><Sparkles size={16} /><span className="desktop-label">{optimized ? 'Optimized' : 'Optimize interpolations'}</span><span className="mobile-label">{optimized ? 'Done' : 'Headings'}</span></button>
        <button className="primary-button" onClick={() => downloadJava(code)}><Download size={16} />Export Java</button>
      </div>
    </header>

    <main className="workspace">
      <div className="canvas-column">
        <div className="section-bar">
          <div><Route size={15}/>Your route <small>{Math.max(0, points.length - 1)} segments · {points.filter(point => point.action).length} commands</small></div>
          <div className="section-actions">
            <button onClick={undo} disabled={!history.length} title="Undo"><Undo2 size={15} />Undo</button>
            <button onClick={() => { updatePoints(seedWaypoints()); setSelectedId(null) }} title="Reset demo path"><RotateCcw size={15} />Reset</button>
          </div>
        </div>
        <FieldCanvas
          points={points} decisions={decisions} selectedId={selectedId} tool={tool} snap={snap}
          onToolChange={setTool} onSnapChange={setSnap} onPointsChange={updatePoints} onSelect={setSelectedId}
        />
      </div>

      <aside className="right-column">
        <section className="inspector-panel">
          <Inspector
            point={selectedPoint} index={selectedIndex} decision={selectedDecision}
            onChange={updateSelected}
            onDelete={() => {
              if (!selectedId) return
              updatePoints(points.filter(point => point.id !== selectedId))
              setSelectedId(null)
            }}
          />
        </section>
        <CodePanel code={code} onExport={() => downloadJava(code)} />
      </aside>
    </main>
    <footer><span>Pedro coordinates</span><b>(0, 0)</b> bottom-left <i /> <b>+X</b> right <i /> <b>+Y</b> up <i /> heading is counter-clockwise</footer>
  </div>
}
