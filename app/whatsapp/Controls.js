import { cloneElement, useId, useLayoutEffect, useRef } from 'react';

export function Field({ name, children, error }) {
  const id = useId();
  return (
    <div className="wa-field">
      <label htmlFor={id}>{name}</label>
      {cloneElement(children, {
        id,
        ...(error && {
          'aria-invalid': true,
          'aria-describedby': id + '-error',
        }),
      })}
      {error && (
        <span className="wa-field-error" role="alert" id={id + '-error'}>
          {error}
        </span>
      )}
    </div>
  );
}
export function Panel({ title, action, children }) {
  return (
    <section className="wa-panel">
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Table({ columns, rows, empty = 'No matching records.' }) {
  return (
    <div className="wa-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, cells }) => (
            <tr key={id}>
              {cells.map((value, i) => (
                <td key={i}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="wa-empty">{empty}</p>}
    </div>
  );
}
export function Status({ children }) {
  const tone = ['Enabled', 'Submitted', 'Opted in', 'Active sample'].includes(
    children,
  )
    ? 'good'
    : ['Failed', 'Opted out', 'Disabled'].includes(children)
      ? 'bad'
      : 'neutral';
  return <span className={'wa-status ' + tone}>{children}</span>;
}
export const stamp = (value) =>
  value
    ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : '—';
export function Notice({ children }) {
  return (
    children && (
      <p role="alert" className="wa-error">
        {children}
      </p>
    )
  );
}

export function EditorDialog({ title, onClose, children }) {
  const ref = useRef(null);
  const heading = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    const fallback = trigger?.closest('article')?.querySelector('button');
    dialog.showModal();
    dialog
      .querySelector('[data-initial-focus]')
      ?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      const destination = trigger?.isConnected ? trigger : fallback;
      if (destination?.isConnected) destination.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="wa-editor"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="wa-editor-head">
        <h3 id={heading}>{title}</h3>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          Close
        </button>
      </header>
      {children}
    </dialog>
  );
}
