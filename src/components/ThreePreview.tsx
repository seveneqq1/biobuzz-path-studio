import { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'
import { Box } from 'lucide-react'

const Scene=lazy(()=>import('./Scene3D'))
export function ThreePreview(props:ComponentProps<typeof Scene>) {
  return <Suspense fallback={<div className="scene-loading"><Box size={28}/><span>Building the field…</span></div>}><Scene {...props}/></Suspense>
}
