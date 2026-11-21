import { useState } from 'react';
import { intervals, nextEligible } from './demo.mjs';
import { EditorDialog, Field, Panel, Status, Table, stamp } from './Controls';

export function Reminders({
  items,
  setItems,
  directory,
  catalog,
  logs,
  setLogs,
}) {
  const [editing, edit] = useState(null),
    [error, fail] = useState(null),
    [disable, confirm] = useState(null);
  const eligible = directory.filter((c) => c.consent === 'Opted in');
  function open(item) {
    edit({ ...item });
    fail(null);
  }
  function update(item) {
    setItems((prev) => prev.map((r) => (r.id === item.id ? item : r)));
  }
  function save(e) {
    e.preventDefault();
    const days = Number(editing.days);
    const missing = !editing.name.trim()
      ? ['name', 'Enter a reminder name.']
      : !eligible.some((c) => c.id === editing.contact)
        ? ['contact', 'Choose a contact who has opted in.']
        : !editing.first
          ? ['first', 'Set the first eligible time in UTC.']
          : null;
    if (missing) {
      fail({ field: missing[0], message: missing[1] });
      e.currentTarget.elements.namedItem(missing[0])?.focus();
      return;
    }
    const item = {
      ...editing,
      name: editing.name.trim(),
      days,
      status: days
        ? editing.status === 'Paused'
          ? 'Paused'
          : 'Enabled'
        : 'Disabled',
    };
    if (editing.id) update(item);
    else setItems([...items, { ...item, id: crypto.randomUUID() }]);
    edit(null);
  }
  function simulate(item, result) {
    const time = nextEligible(item);
    if (!time || !eligible.some((c) => c.id === item.contact)) return;
    update({ ...item, last: time });
    setLogs((prev) => [
      {
        id: crypto.randomUUID(),
        contact: item.contact,
        template: item.template,
        time,
        result,
        source: item.id,
        error: result === 'Failed' ? 'Simulated failure' : '',
      },
      ...prev,
    ]);
  }
  return (
    <>
      <Panel
        title="Reminder schedules"
        action={
          <button
            className="primary"
            onClick={() =>
              open({
                name: '',
                contact: eligible[0]?.id || '',
                template: catalog[0].name,
                days: 3,
                first: '2026-04-09T09:00:00Z',
                last: null,
                status: 'Enabled',
              })
            }
          >
            Add reminder
          </button>
        }
      >
        <p className="wa-schedule-rule">
          The next interval starts at the last simulated attempt, including a
          failed attempt.
        </p>
        {!items.length && <p>Add a reminder to preview its schedule.</p>}
        {items.map((r) => (
          <article className="wa-schedule" key={r.id}>
            <div className="wa-schedule-summary">
              <div>
                <h4>{r.name}</h4>
                <span>
                  {directory.find((c) => c.id === r.contact)?.name ||
                    'Contact unavailable'}
                </span>
              </div>
              <div>
                <span className="wa-schedule-label">Template</span>
                <span className="wa-template-name">{r.template}</span>
              </div>
              <div>
                <span className="wa-schedule-label">Interval</span>
                <span>
                  {r.days
                    ? 'Every ' + r.days + (r.days === 1 ? ' day' : ' days')
                    : 'No recurrence'}
                </span>
              </div>
              <Status>{r.status}</Status>
            </div>
            <div className="wa-schedule-times">
              <span>Next eligible: {stamp(nextEligible(r))}</span>
              <span>Last attempt: {stamp(r.last)}</span>
            </div>
            <div className="wa-schedule-actions">
              <button onClick={() => open(r)}>Edit reminder</button>
              {r.days > 0 && r.status !== 'Disabled' && (
                <button
                  onClick={() =>
                    update({
                      ...r,
                      status: r.status === 'Paused' ? 'Enabled' : 'Paused',
                    })
                  }
                >
                  {r.status === 'Paused' ? 'Resume' : 'Pause'}
                </button>
              )}
              {r.status !== 'Disabled' && (
                <button onClick={() => confirm(r.id)}>Disable</button>
              )}
              {['Submitted', 'Failed'].map((outcome) => (
                <button
                  key={outcome}
                  disabled={
                    !nextEligible(r) ||
                    !eligible.some((c) => c.id === r.contact)
                  }
                  title={
                    !nextEligible(r)
                      ? 'Enable recurrence to simulate an attempt'
                      : !eligible.some((c) => c.id === r.contact)
                        ? 'Recipient consent is required'
                        : undefined
                  }
                  onClick={() => simulate(r, outcome)}
                >
                  Simulate {outcome === 'Failed' ? 'failure' : 'submission'}
                </button>
              ))}
            </div>
            {disable === r.id && (
              <EditorDialog
                title="Disable reminder?"
                onClose={() => confirm(null)}
              >
                <p>
                  Disable {r.name}? Its attempt history will stay available.
                </p>
                <div className="wa-editor-footer">
                  <button data-initial-focus onClick={() => confirm(null)}>
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      update({ ...r, days: 0, status: 'Disabled' });
                      confirm(null);
                    }}
                  >
                    Confirm disable
                  </button>
                </div>
              </EditorDialog>
            )}
          </article>
        ))}
      </Panel>
      {editing && (
        <EditorDialog title="Configure reminder" onClose={() => edit(null)}>
          <form noValidate onSubmit={save} onChange={() => fail(null)}>
            <div className="wa-fields">
              <Field
                name="Reminder name"
                error={error?.field === 'name' && error.message}
              >
                <input
                  required
                  name="name"
                  data-initial-focus
                  value={editing.name}
                  onChange={(e) => edit({ ...editing, name: e.target.value })}
                />
              </Field>
              <Field
                name="Reminder contact"
                error={error?.field === 'contact' && error.message}
              >
                <select
                  name="contact"
                  required
                  value={editing.contact}
                  onChange={(e) =>
                    edit({ ...editing, contact: e.target.value })
                  }
                >
                  <option value="">Choose contact</option>
                  {eligible.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="Reminder template">
                <select
                  value={editing.template}
                  onChange={(e) =>
                    edit({ ...editing, template: e.target.value })
                  }
                >
                  {catalog.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
              </Field>
              <Field name="Interval in days">
                <select
                  value={editing.days}
                  onChange={(e) => edit({ ...editing, days: e.target.value })}
                >
                  <option value="">None</option>
                  {[0, ...intervals].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field
                name="First eligible time (UTC)"
                error={error?.field === 'first' && error.message}
              >
                <input
                  name="first"
                  type="datetime-local"
                  required
                  disabled={!!editing.last}
                  value={editing.first?.slice(0, 16) || ''}
                  onChange={(e) =>
                    edit({
                      ...editing,
                      first: e.target.value ? e.target.value + ':00Z' : '',
                    })
                  }
                />
              </Field>
            </div>
            {editing.id && !Number(editing.days) && (
              <p>
                Saving with no interval disables recurrence and preserves
                history.
              </p>
            )}
            <div className="wa-editor-footer">
              <button type="button" onClick={() => edit(null)}>
                Cancel
              </button>
              <button className="primary">
                {editing.id && !Number(editing.days)
                  ? 'Confirm disabled schedule'
                  : 'Save reminder'}
              </button>
            </div>
          </form>
        </EditorDialog>
      )}
      <Panel title="Reminder history">
        <Table
          columns={['Reminder', 'Attempt time', 'Sample result']}
          rows={logs
            .filter((l) => items.some((r) => r.id === l.source))
            .map((l) => ({
              id: l.id,
              cells: [
                items.find((r) => r.id === l.source).name,
                stamp(l.time),
                <Status>{l.result}</Status>,
              ],
            }))}
        />
      </Panel>
    </>
  );
}
