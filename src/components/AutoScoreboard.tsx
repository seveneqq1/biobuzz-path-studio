import type { RobotConfig, SimState } from '../lib/simulation'
import { scoreAuto, SCORING_MANUAL } from '../lib/scoring'

export function AutoScoreboard({state,config}:{state:SimState;config:RobotConfig}) {
  const scores=scoreAuto(state,config)
  return <section className="auto-scoreboard" aria-label="Autonomous scoreboard">
    <div className="score-strip">
      <div className="score-alliance red"><span>Red</span><strong>{scores[0].total}</strong></div>
      <div className="score-phase"><span>{state.blocked?'Blocked run':state.finished?'Auto summary':'AUTO estimate'}</span><strong>{state.time.toFixed(1)}<small> / 30 s</small></strong></div>
      <div className="score-alliance blue"><strong>{scores[1].total}</strong><span>Blue</span></div>
    </div>
    <details open={state.finished||state.blocked}>
      <summary>Score breakdown <span>Single-robot estimate</span></summary>
      <table><thead><tr><th>Achievement</th><th>Red</th><th>Blue</th></tr></thead><tbody>
        <tr><th>Hive tips × 20</th>{scores.map(s=><td key={s.side}>{s.tips} / {s.tips*20} pts</td>)}</tr>
        <tr><th>Leave × 3</th>{scores.map(s=><td key={s.side}>{s.leave*3} pts</td>)}</tr>
        <tr><th>Auto park × 5</th>{scores.map(s=><td key={s.side}>{s.park*5} pts</td>)}</tr>
        <tr className="score-total"><th>AUTO total</th>{scores.map(s=><td key={s.side}>{s.total} pts</td>)}</tr>
        <tr><th colSpan={3}>End-state potential only · not AUTO points</th></tr>
        <tr><th>Upward cell pieces × 2</th>{scores.map(s=><td key={s.side}>{s.cells} / {s.cells*2} pts</td>)}</tr>
        <tr><th>Owned flower pieces × 2</th>{scores.map(s=><td key={s.side}>{s.flower} / {s.flower*2} pts</td>)}</tr>
        <tr><th>Bottom nectar bonus × 5</th>{scores.map(s=><td key={s.side}>{s.bottomNectar*5} pts</td>)}</tr>
        <tr><th>Garden pieces × 1</th>{scores.map(s=><td key={s.side}>{s.garden} pts</td>)}</tr>
      </tbody></table>
      <p>Route-end estimate, capped at 30 s. No partner, penalties, RP or 8-second transition settling. Flower/garden values are a position-based end-state projection, not awards during AUTO. <a href={SCORING_MANUAL} target="_blank" rel="noreferrer">FIRST TU04 §10.5</a></p>
    </details>
  </section>
}
