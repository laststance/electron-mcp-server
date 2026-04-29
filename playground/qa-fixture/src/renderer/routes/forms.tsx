import { useState } from 'react'

export function Forms() {
  const [radioChoice, setRadioChoice] = useState<string>('alpha')
  const [checks, setChecks] = useState<{ a: boolean; b: boolean; c: boolean }>({
    a: false,
    b: true,
    c: false,
  })
  const [singleSelect, setSingleSelect] = useState<string>('jp')
  const [multiSelect, setMultiSelect] = useState<string[]>(['react'])
  const [fileName, setFileName] = useState<string>('')
  const [textareaValue, setTextareaValue] = useState<string>('')
  const [submittedAt, setSubmittedAt] = useState<string>('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittedAt(new Date().toISOString())
  }

  return (
    <form className="section" onSubmit={handleSubmit} data-testid="forms-section">
      <h2>Form widgets</h2>

      <div className="field-row">
        <label>
          <span>Radio group</span>
        </label>
        {(['alpha', 'beta', 'gamma'] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="greek"
              value={value}
              data-testid={`radio-${value}`}
              checked={radioChoice === value}
              onChange={() => setRadioChoice(value)}
            />
            {value}
          </label>
        ))}
        <span data-testid="radio-current">selected: {radioChoice}</span>
      </div>

      <div className="field-row">
        <label>
          <span>Checkboxes</span>
        </label>
        {(['a', 'b', 'c'] as const).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              data-testid={`checkbox-${key}`}
              checked={checks[key]}
              onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })}
            />
            opt-{key}
          </label>
        ))}
      </div>

      <div className="field-row">
        <label>
          <span>Single select</span>
          <select
            data-testid="single-select"
            value={singleSelect}
            onChange={(e) => setSingleSelect(e.target.value)}
          >
            <option value="jp">Japan</option>
            <option value="us">United States</option>
            <option value="de">Germany</option>
          </select>
        </label>
      </div>

      <div className="field-row">
        <label>
          <span>Multi select</span>
          <select
            data-testid="multi-select"
            multiple
            size={4}
            value={multiSelect}
            onChange={(e) =>
              setMultiSelect(Array.from(e.target.selectedOptions, (option) => option.value))
            }
          >
            <option value="react">React</option>
            <option value="vue">Vue</option>
            <option value="svelte">Svelte</option>
            <option value="solid">Solid</option>
          </select>
        </label>
      </div>

      <div className="field-row">
        <label>
          <span>File input</span>
          <input
            type="file"
            data-testid="file-input"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </label>
        <span data-testid="file-name">{fileName}</span>
      </div>

      <div className="field-row">
        <label>
          <span>Textarea</span>
          <textarea
            data-testid="textarea"
            rows={3}
            value={textareaValue}
            onChange={(e) => setTextareaValue(e.target.value)}
            placeholder="Type freely"
          />
        </label>
      </div>

      <div className="field-row">
        <label>
          <span>Disabled input</span>
          <input type="text" disabled data-testid="disabled-input" defaultValue="cannot edit" />
        </label>
        <input type="hidden" data-testid="hidden-input" defaultValue="hidden-payload" />
      </div>

      <div className="field-row">
        <button type="submit" data-testid="forms-submit">
          Submit
        </button>
        <span data-testid="forms-submitted-at">{submittedAt}</span>
      </div>
    </form>
  )
}
