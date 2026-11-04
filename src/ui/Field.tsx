import { useId, type ReactNode } from 'react'

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  prefix?: string
  suffix?: string
  hint?: ReactNode
  /** Shown as a reset link when the value differs from it. */
  defaultValue?: string
  invalid?: boolean
}

export function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  defaultValue,
  invalid,
}: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const changed = defaultValue !== undefined && value !== defaultValue
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {changed && (
          <button type="button" className="link" onClick={() => onChange(defaultValue)}>
            Reset
          </button>
        )}
      </div>
      <div className={`input-wrap${invalid ? ' invalid' : ''}`}>
        {prefix && <span className="affix">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </div>
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  )
}
