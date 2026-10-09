import { useEffect, useRef, useState } from 'react'
import { editWaypoint, distance } from '../lib/geometry'
import { previewKeyDelta, turnPreviewPose } from '../lib/previewHeading'
import { robotSupportCollision } from '../lib/supportCollisions'
import { clearsWalls } from '../lib/walls'
import type { Waypoint } from '../types'
import type { RobotConfig, SimState } from '../lib/simulation'

interface Options {
  enabled:boolean;points:Waypoint[];config:RobotConfig;view:SimState;selectedId:string|null
  onSelect:(id:string|null)=>void;onPointsChange:(points:Waypoint[])=>void;onPause:()=>void
}
export function usePreviewHeading(options:Options) {
  const live=useRef(options)
  const [draft,setDraft]=useState<Waypoint|null>(null),[message,setMessage]=useState('')
  const draftRef=useRef<Waypoint|null>(null),held=useRef(new Set<string>())
  const set=(next:Waypoint|null)=>{draftRef.current=next;setDraft(next)}
  const begin=(id?:string)=>{
    const o=live.current
    if(draftRef.current&&!id)return draftRef.current
    const point=o.points.find(p=>p.id===(id??o.selectedId))??o.points.reduce<Waypoint|undefined>((best,p)=>!best||distance(p,o.view)<distance(best,o.view)?p:best,undefined)
    if(!point)return null
    o.onPause()
    if(!clearsWalls(point,o.config.size)||robotSupportCollision(point,o.config.size)){setMessage('This waypoint is obstructed. Use Snap to nearest safe spot first.');return null}
    const next={...point};set(next);o.onSelect(next.id);setMessage('Preview paused. Enter applies to the path; Esc cancels.');return next
  }
  const turn=(delta:number)=>{
    const point=begin();if(!point)return
    const result=turnPreviewPose(point,delta,live.current.config.size)
    set({...point,heading:result.pose.heading})
    setMessage(result.blocked?'Rotation stopped at an obstacle. Snap this waypoint to add clearance.':'Preview paused. Enter applies to the path; Esc cancels.')
  }
  const cancel=()=>{set(null);held.current.clear();setMessage('')}
  const apply=()=>{
    const point=draftRef.current;if(!point)return
    live.current.onPointsChange(editWaypoint(live.current.points,point.id,{heading:point.heading}))
    cancel()
  }
  const actions=useRef({begin,turn,cancel,apply})
  useEffect(()=>{live.current=options;actions.current={begin,turn,cancel,apply}})
  useEffect(()=>{
    // Inspector edits, snapping and configuration changes invalidate rehearsal
    // coordinates. Never render an old draft over a newly planned trajectory.
    const frame=requestAnimationFrame(()=>actions.current.cancel())
    return()=>cancelAnimationFrame(frame)
  },[options.points,options.config])
  useEffect(()=>{
    if(!options.enabled)return
    const keys=held.current
    const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,select,textarea,[contenteditable="true"]')
    const down=(e:KeyboardEvent)=>{
      if(editable(e.target)||e.ctrlKey||e.metaKey||e.altKey)return
      const key=e.key.length===1?e.key.toLowerCase():e.key
      if(['a','d','ArrowLeft','ArrowRight'].includes(key)){e.preventDefault();actions.current.begin();keys.add(key)}
      if(['w','s'].includes(key)){e.preventDefault();if(!e.repeat)actions.current.turn(previewKeyDelta(key,0,0))}
      if(key==='Enter'&&draftRef.current){e.preventDefault();actions.current.apply()}
      if(key==='Escape'&&draftRef.current){e.preventDefault();actions.current.cancel()}
    }
    const up=(e:KeyboardEvent)=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key)
    const blur=()=>keys.clear()
    let frame=0,last=0
    const tick=(now:number)=>{
      const dt=last?Math.min(.05,(now-last)/1000):0;last=now
      const delta=[...keys].reduce((sum,key)=>sum+previewKeyDelta(key,dt,live.current.config.turnRate),0)
      if(delta)actions.current.turn(delta)
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur)
    return()=>{cancelAnimationFrame(frame);keys.clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur)}
  },[options.enabled])
  const current=draft&&options.points.some(p=>p.id===draft.id)?draft:null
  const pose=current?{...options.view,x:current.x,y:current.y,heading:current.heading,turretYaw:current.heading+(options.view.turretYaw-options.view.heading)}:options.view
  const controls=options.enabled&&<div className="heading-rehearsal">
    <span>{current?`Waypoint ${options.points.findIndex(p=>p.id===current.id)+1} · ${current.heading.toFixed(1)}°`:'Rotate in preview: A/D or ←/→ · W/S ±90°'}</span>
    <button onClick={()=>begin()}>Edit heading</button>
    {current&&<><select aria-label="Preview waypoint" value={current.id} onChange={e=>begin(e.target.value)}>{options.points.map((p,i)=><option value={p.id} key={p.id}>Waypoint {i+1}</option>)}</select>
      <button aria-label="Rotate 90 degrees counterclockwise" onClick={()=>turn(90)}>↶ 90°</button><button aria-label="Rotate 90 degrees clockwise" onClick={()=>turn(-90)}>↷ 90°</button>
      <button onClick={apply}>Apply heading</button><button onClick={cancel}>Cancel</button></>}
    {message&&<small role="status">{message}</small>}
  </div>
  return {pose,controls,cancel,editing:!!current}
}
