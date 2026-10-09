import { Check, Clipboard, Code2, Download } from 'lucide-react'
import { useState } from 'react'

interface Props { code: string; onExport: () => void }

const tokenPattern = /(\/\/.*$|"[^"\n]*"|\b(?:package|import|static|public|private|class|new|void|final|return|extends|boolean|false|true|if|throw)\b|\b(?:Pose|PoseFactory|Paths|Path|Command|Scheduler|Object|Follower|Interpolator|Math|Override|Autonomous)\b|\b\d+(?:\.\d+)?\b)/gm
const completeTokenPattern = /^(\/\/.*|"[^"\n]*"|(?:package|import|static|public|private|class|new|void|final|return|extends|boolean|false|true|if|throw)|(?:Pose|PoseFactory|Paths|Path|Command|Scheduler|Object|Follower|Interpolator|Math|Override|Autonomous)|\d+(?:\.\d+)?)$/

function tokenClass(token: string) {
  if (token.startsWith('//')) return 'tok-comment'
  if (token.startsWith('"')) return 'tok-string'
  if (/^\d/.test(token)) return 'tok-number'
  if (/^(package|import|static|public|private|class|new|void|final|return|extends|boolean|false|true|if|throw)$/.test(token)) return 'tok-key'
  return 'tok-type'
}

function colorize(code: string) {
  return code.split('\n').map((line, index) => {
    const fragments = line.split(tokenPattern)
    return <div className="code-line" key={index}><span className="line-number">{index + 1}</span><span>{fragments.map((fragment, part) => completeTokenPattern.test(fragment) ? <span className={tokenClass(fragment)} key={part}>{fragment}</span> : fragment)}</span></div>
  })
}

export function CodePanel({ code, onExport }: Props) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    let succeeded: boolean
    try {
      await navigator.clipboard.writeText(code)
      succeeded = true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = code
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      succeeded = document.execCommand('copy')
      textarea.remove()
    }
    if (succeeded) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }
  }
  return <section className="code-panel" aria-label="Generated Java code">
    <div className="code-header">
      <div><Code2 size={16} /><span>SanaAuto.java</span><small>Pedro 3 + Ivy</small></div>
      <div className="code-actions">
        <button onClick={copy}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy'}</button>
        <button onClick={onExport}><Download size={15} />Export</button>
      </div>
    </div>
    <pre className="code-window"><code>{colorize(code)}</code></pre>
  </section>
}
