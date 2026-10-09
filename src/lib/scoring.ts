import type { SimState, RobotConfig } from './simulation'
import { flowers } from './simulation'
import { pieceRadius } from './hivePhysics'
import { clearsWalls, wallExtent } from './walls'

export const SCORING_MANUAL='https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU04.htm'
// TU04 §10.5 / Table 10-2: flowers, garden and remaining cells are NOT AUTO points.
export const SCORE_VALUES={tip:20,leave:3,park:5,cell:2,flower:2,bottomNectar:5,garden:1} as const
export function scoreAuto(state:SimState,config:RobotConfig) {
  const extent=wallExtent(state.heading,config.size)
  const zones={red:{x0:.5,x1:23.5,y0:0,y1:11},blue:{x0:95.5,x1:118.5,y0:133,y1:144}}
  const parked=(side:'red'|'blue')=>{
    if(config.alliance!==side||state.travelled<=.05)return false
    const box=zones[side],angle=state.heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),h=config.size/2
    const dx=(box.x0+box.x1)/2-state.x,dy=(box.y0+box.y1)/2-state.y,hx=(box.x1-box.x0)/2,hy=(box.y1-box.y0)/2
    return Math.abs(dx)<hx+extent&&Math.abs(dy)<hy+extent&&Math.abs(dx*c+dy*s)<h+hx*Math.abs(c)+hy*Math.abs(s)&&Math.abs(-dx*s+dy*c)<h+hx*Math.abs(s)+hy*Math.abs(c)
  }
  const flowerPieces=flowers.map(center=>state.balls.filter(ball=>
    ball.flower===undefined&&Math.hypot(ball.x-center.x,ball.y-center.y)<2+pieceRadius(ball.kind)&&ball.z+pieceRadius(ball.kind)>12&&ball.z-pieceRadius(ball.kind)<21.5).sort((a,b)=>a.z-b.z))
  const flowerCounts={red:0,blue:0},bottomCounts={red:0,blue:0}
  for(const pieces of flowerPieces){
    const nectar=pieces.filter(b=>b.kind==='nectar'&&b.color)
    const bottom=nectar[0]?.color,owner=nectar.at(-1)?.color
    if(bottom)bottomCounts[bottom]++
    if(owner)flowerCounts[owner]+=pieces.length
  }
  return (['red','blue'] as const).map((side,index)=>{
    // LEAVE is assessed at the AUTO endpoint, not a latched achievement from
    // earlier motion: returning to contact with a perimeter wall does not count.
    const tips=state.hives[index].tips,leave=config.alliance===side&&state.leftWall&&clearsWalls(state,config.size+.02)?1:0,park=parked(side)?1:0
    const cells=state.hives[index].contents[state.hives[index].side].length
    const garden=state.balls.filter(b=>b.flower===undefined&&(side==='red'
      ?b.x+pieceRadius(b.kind)>=142&&b.y-pieceRadius(b.kind)<=23
      :b.x-pieceRadius(b.kind)<=2&&b.y+pieceRadius(b.kind)>=121)).length
    const total=tips*SCORE_VALUES.tip+leave*SCORE_VALUES.leave+park*SCORE_VALUES.park
    const potential=cells*SCORE_VALUES.cell+garden*SCORE_VALUES.garden+flowerCounts[side]*SCORE_VALUES.flower+bottomCounts[side]*SCORE_VALUES.bottomNectar
    return {side,tips,leave,park,total,cells,garden,flower:flowerCounts[side],bottomNectar:bottomCounts[side],potential}
  })
}
