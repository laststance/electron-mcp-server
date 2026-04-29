import { useEffect, useState } from 'react'

type Bucket = 'local' | 'session'

function readBucket(bucket: Bucket): Record<string, string> {
  const target = bucket === 'local' ? localStorage : sessionStorage
  const result: Record<string, string> = {}
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key !== null) {
      result[key] = target.getItem(key) ?? ''
    }
  }
  return result
}

export function Storage() {
  const [bucket, setBucket] = useState<Bucket>('local')
  const [keyInput, setKeyInput] = useState('')
  const [valueInput, setValueInput] = useState('')
  const [snapshot, setSnapshot] = useState<Record<string, string>>({})

  const refresh = () => setSnapshot(readBucket(bucket))

  useEffect(() => {
    refresh()
    // re-read when the bucket toggle flips
  }, [bucket])

  const set = () => {
    if (!keyInput) return
    const target = bucket === 'local' ? localStorage : sessionStorage
    target.setItem(keyInput, valueInput)
    refresh()
  }

  const remove = () => {
    if (!keyInput) return
    const target = bucket === 'local' ? localStorage : sessionStorage
    target.removeItem(keyInput)
    refresh()
  }

  const clearAll = () => {
    const target = bucket === 'local' ? localStorage : sessionStorage
    target.clear()
    refresh()
  }

  return (
    <div className="section" data-testid="storage-section">
      <h2>Storage</h2>
      <div className="field-row">
        <label>
          <span>Bucket</span>
          <select
            data-testid="storage-bucket"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as Bucket)}
          >
            <option value="local">localStorage</option>
            <option value="session">sessionStorage</option>
          </select>
        </label>
      </div>
      <div className="field-row">
        <label>
          <span>Key</span>
          <input
            type="text"
            data-testid="storage-key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="key"
          />
        </label>
        <label>
          <span>Value</span>
          <input
            type="text"
            data-testid="storage-value"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            placeholder="value"
          />
        </label>
      </div>
      <div className="field-row">
        <button type="button" data-testid="storage-set" onClick={set}>
          Set
        </button>
        <button type="button" data-testid="storage-remove" onClick={remove}>
          Remove
        </button>
        <button type="button" data-testid="storage-clear" onClick={clearAll}>
          Clear all
        </button>
        <button type="button" data-testid="storage-refresh" onClick={refresh}>
          Refresh
        </button>
      </div>
      <pre data-testid="storage-snapshot" style={{ background: '#f7f7f8', padding: 12, borderRadius: 6 }}>
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </div>
  )
}
