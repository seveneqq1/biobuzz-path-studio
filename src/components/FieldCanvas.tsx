import { useEffect, useMemo, useRef, useState } from 'react'
import { Arrow, Circle, Group, Image, Layer, Line, Shape, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import { Crosshair, Hand, MousePointer2, PenTool, RotateCcw, ScanLine, ZoomIn, ZoomOut } from 'lucide-react'
import type { CanvasTool, Point2D, SegmentDecision, Waypoint } from '../types'
import { canvasToWorld, clamp, controls, FIELD_PIXELS, normalizeDegrees, simplify, tangentDegrees, worldToCanvas } from '../lib/geometry'

interface Props {
  points: Waypoint[]
  decisions: SegmentDecision[]
  selectedId: string | null
  tool: CanvasTool
  snap: boolean
  onToolChange: (tool: CanvasTool) => void
  onSnapChange: (snap: boolean) => void
  onPointsChange: (points: Waypoint[]) => void
  onSelect: (id: string | null) => void
}

const toolItems: { id: CanvasTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'draw', label: 'Draw', icon: PenTool },
  { id: 'waypoint', label: 'Point', icon: Crosshair },
  { id: 'pan', label: 'Pan', icon: Hand },
]

export function FieldCanvas({ points, decisions, selectedId, tool, snap, onToolChange, onSnapChange, onPointsChange, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 760, height: 720 })
  const [scale, setScale] = useState(0.86)
  const [position, setPosition] = useState({ x: 32, y: 28 })
  const [cursor, setCursor] = useState<Point2D>({ x: 0, y: 0 })
  const [stroke, setStroke] = useState<Point2D[]>([])
  const [drawing, setDrawing] = useState(false)
  const [fieldImage, setFieldImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    const image = new window.Image()
    image.src = '/biobuzz-field.png'
    image.onload = () => setFieldImage(image)
  }, [])

  useEffect(() => {
    if (!wrapRef.current) return
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
      const fit = Math.min((width - 56) / FIELD_PIXELS, (height - 76) / FIELD_PIXELS)
      setScale(clamp(fit, 0.38, 1.4))
      setPosition({ x: Math.max(28, (width - FIELD_PIXELS * fit) / 2), y: 24 })
    })
    resize.observe(wrapRef.current)
    return () => resize.disconnect()
  }, [])

  const pointerInField = () => {
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) return null
    return { x: (pointer.x - position.x) / scale, y: (pointer.y - position.y) / scale }
  }

  const updateCursor = () => {
    const local = pointerInField()
    if (local) setCursor(canvasToWorld(local))
  }

  const handleDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    updateCursor()
    if (event.target !== event.target.getStage()) return
    const local = pointerInField()
    if (!local) return
    if (tool === 'draw') {
      setDrawing(true)
      setStroke([local])
      onSelect(null)
    } else if (tool === 'waypoint') {
      const world = canvasToWorld(local, snap)
      const previous = points.at(-1)
      onPointsChange([...points, {
        ...world,
        id: crypto.randomUUID(),
        heading: previous ? tangentDegrees(previous, world) : 0,
        interpolation: 'auto',
        controlWeight: 1,
      }])
    } else if (tool === 'select') onSelect(null)
  }

  const handleMove = () => {
    updateCursor()
    if (!drawing || tool !== 'draw') return
    const local = pointerInField()
    if (!local) return
    const last = stroke.at(-1)
    if (!last || Math.hypot(local.x - last.x, local.y - last.y) > 7) setStroke(current => [...current, local])
  }

  const handleUp = () => {
    if (!drawing) return
    setDrawing(false)
    const sampled = simplify(stroke, 9).map(point => canvasToWorld(point, snap))
    if (sampled.length >= 2) {
      const next = sampled.map((point, index) => ({
        ...point,
        id: crypto.randomUUID(),
        heading: tangentDegrees(point, sampled[index + 1] ?? sampled[index - 1] ?? point),
        interpolation: 'auto' as const,
        controlWeight: 1,
      }))
      onPointsChange(next)
      onSelect(next[0].id)
    }
    setStroke([])
  }

  const resetView = () => {
    const fit = Math.min((size.width - 56) / FIELD_PIXELS, (size.height - 76) / FIELD_PIXELS)
    setScale(fit)
    setPosition({ x: Math.max(28, (size.width - FIELD_PIXELS * fit) / 2), y: 24 })
  }

  const pathShapes = useMemo(() => points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]
    const { c1, c2 } = controls(points, index)
    return { index, point, next, c1, c2 }
  }), [points])

  const updatePoint = (id: string, changes: Partial<Waypoint>) => onPointsChange(points.map(p => p.id === id ? { ...p, ...changes } : p))

  return <section className="field-panel" ref={wrapRef} aria-label="Interactive BIOBUZZ field">
    <div className="canvas-tools" role="toolbar" aria-label="Canvas tools">
      <div className="tool-cluster">
        {toolItems.map(item => <button key={item.id} className={tool === item.id ? 'tool active' : 'tool'} onClick={() => onToolChange(item.id)} title={item.label} aria-label={item.label}><item.icon size={17} /></button>)}
      </div>
      <div className="tool-cluster">
        <button className={snap ? 'tool active' : 'tool'} onClick={() => onSnapChange(!snap)} title="Snap to 6-inch grid"><ScanLine size={17} /></button>
        <button className="tool" onClick={() => setScale(value => clamp(value * 1.15, .35, 3))} title="Zoom in"><ZoomIn size={17} /></button>
        <button className="tool" onClick={() => setScale(value => clamp(value / 1.15, .35, 3))} title="Zoom out"><ZoomOut size={17} /></button>
        <button className="tool" onClick={resetView} title="Reset view"><RotateCcw size={17} /></button>
      </div>
    </div>
    <div className="coordinate-readout"><span>X {cursor.x.toFixed(1)}</span><span>Y {cursor.y.toFixed(1)}</span><small>in</small></div>
    <Stage
      ref={stageRef} width={size.width} height={size.height}
      onMouseDown={handleDown} onTouchStart={handleDown}
      onMouseMove={handleMove} onTouchMove={handleMove}
      onMouseUp={handleUp} onTouchEnd={handleUp}
      onWheel={event => {
        event.evt.preventDefault()
        const stage = stageRef.current
        const pointer = stage?.getPointerPosition()
        if (!pointer) return
        const mouse = { x: (pointer.x - position.x) / scale, y: (pointer.y - position.y) / scale }
        const next = clamp(event.evt.deltaY > 0 ? scale / 1.08 : scale * 1.08, .35, 3)
        setScale(next)
        setPosition({ x: pointer.x - mouse.x * next, y: pointer.y - mouse.y * next })
      }}
      draggable={tool === 'pan'} x={0} y={0}
      onDragEnd={event => {
        if (tool !== 'pan') return
        setPosition({ x: position.x + event.target.x(), y: position.y + event.target.y() })
        event.target.position({ x: 0, y: 0 })
      }}
      style={{ cursor: tool === 'draw' ? 'crosshair' : tool === 'pan' ? 'grab' : 'default' }}
    >
      <Layer x={position.x} y={position.y} scaleX={scale} scaleY={scale}>
        <Image image={fieldImage ?? undefined} width={FIELD_PIXELS} height={FIELD_PIXELS} listening={false} />
        {Array.from({ length: 25 }).map((_, i) => <Line key={`v${i}`} points={[i * 30, 0, i * 30, FIELD_PIXELS]} stroke="rgba(160,190,195,.18)" strokeWidth={i % 4 === 0 ? 1.3 : .55} listening={false} />)}
        {Array.from({ length: 25 }).map((_, i) => <Line key={`h${i}`} points={[0, i * 30, FIELD_PIXELS, i * 30]} stroke="rgba(160,190,195,.18)" strokeWidth={i % 4 === 0 ? 1.3 : .55} listening={false} />)}
        {pathShapes.map(({ index, point, next, c1, c2 }) => {
          const p0 = worldToCanvas(point); const p1 = worldToCanvas(c1); const p2 = worldToCanvas(c2); const p3 = worldToCanvas(next)
          const selected = selectedId === point.id || selectedId === next.id
          return <Group key={next.id}>
            <Shape sceneFunc={(ctx, shape) => { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y); ctx.fillStrokeShape(shape) }} stroke="#09141b" strokeWidth={11} lineCap="round" listening={false} />
            <Shape sceneFunc={(ctx, shape) => { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y); ctx.fillStrokeShape(shape) }} stroke={selected ? '#6ee7f2' : '#f2c94c'} strokeWidth={5} lineCap="round" dash={decisions[index]?.type === 'piecewise' ? [16, 7] : undefined} listening={false} />
            <Text x={(p0.x + p3.x) / 2 - 13} y={(p0.y + p3.y) / 2 - 12} text={`${index + 1}`} width={26} height={24} align="center" verticalAlign="middle" fill="#08161f" fontSize={13} fontStyle="bold" listening={false} />
            <Circle x={(p0.x + p3.x) / 2} y={(p0.y + p3.y) / 2} radius={12} fill="#f2c94c" stroke="#0d1e28" strokeWidth={2} listening={false} />
          </Group>
        })}
        {stroke.length > 1 && <Line points={stroke.flatMap(point => [point.x, point.y])} stroke="#f2c94c" strokeWidth={5} lineCap="round" lineJoin="round" dash={[10, 6]} listening={false} />}
        {points.map((point, index) => {
          const canvas = worldToCanvas(point)
          const radians = -point.heading * Math.PI / 180
          const arrowEnd = { x: canvas.x + Math.cos(radians) * 42, y: canvas.y + Math.sin(radians) * 42 }
          const selected = point.id === selectedId
          return <Group key={point.id}>
            {selected && <Line points={[canvas.x, canvas.y, arrowEnd.x, arrowEnd.y]} stroke="#6ee7f2" strokeWidth={2} dash={[5, 4]} listening={false} />}
            <Arrow points={[canvas.x, canvas.y, arrowEnd.x, arrowEnd.y]} stroke={selected ? '#6ee7f2' : '#fff3c6'} fill={selected ? '#6ee7f2' : '#fff3c6'} pointerLength={8} pointerWidth={8} strokeWidth={3} listening={false} />
            <Circle
              x={canvas.x} y={canvas.y} radius={selected ? 10 : 8}
              fill={selected ? '#6ee7f2' : '#f8faf9'} stroke="#08161f" strokeWidth={3}
              draggable={tool === 'select'}
              onClick={() => onSelect(point.id)} onTap={() => onSelect(point.id)}
              onDragStart={() => onSelect(point.id)}
              onDragMove={event => {
                const world = canvasToWorld({ x: event.target.x(), y: event.target.y() }, snap)
                updatePoint(point.id, world)
              }}
            />
            {selected && <Circle
              x={arrowEnd.x} y={arrowEnd.y} radius={7} fill="#07161e" stroke="#6ee7f2" strokeWidth={3}
              draggable onDragMove={event => {
                const dx = event.target.x() - canvas.x
                const dy = event.target.y() - canvas.y
                updatePoint(point.id, { heading: normalizeDegrees(-Math.atan2(dy, dx) * 180 / Math.PI) })
              }}
              onDragEnd={event => event.target.position(arrowEnd)}
            />}
            <Text x={canvas.x - 22} y={canvas.y + 14} width={44} align="center" text={`${index + 1}`} fill="#ffffff" fontSize={11} fontStyle="bold" listening={false} />
          </Group>
        })}
      </Layer>
    </Stage>
    <a className="field-credit" href="https://www.reddit.com/r/FTC/comments/1weleaj/biobuzz_custom_field_images_meepmeep_compatible/" target="_blank" rel="noreferrer">Field art: Team Juice 16236</a>
    <div className="canvas-hint">{tool === 'draw' ? 'Drag to sketch a new path' : tool === 'waypoint' ? 'Click the field to add a waypoint' : tool === 'pan' ? 'Drag to pan · scroll to zoom' : 'Drag nodes · drag the cyan handle to rotate'}</div>
  </section>
}
