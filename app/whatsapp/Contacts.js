import { useRef, useState } from 'react';
import { consentStates, previewCsv, validateContact } from './demo.mjs';
import './directory.css';
import { EditorDialog, Field, Notice, Panel, Status, Table } from './Controls';

const blank = () => ({
  name: '',
  phone: '',
  consent: 'Unknown',
  variables: {},
});
export function Contacts({
  directory,
  setDirectory,
  selected,
  setSelected,
  startCampaign,
}) {
  const [query, search] = useState(''),
    [filter, setFilter] = useState('All');
  const [edit, setEdit] = useState(null),
    [vars, setVars] = useState([]);
  const [csv, setCsv] = useState(null),
    [preview, setPreview] = useState(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const readGeneration = useRef(0);
  const [fieldError, setFieldError] = useState(null);
  const matches = directory.filter(
    (c) =>
      (filter === 'All' || c.consent === filter) &&
      (c.name + c.phone).toLowerCase().includes(query.toLowerCase()),
  );
  const pageSize = 25;
  const lastPage = Math.max(0, Math.ceil(matches.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * pageSize;
  const visible = matches.slice(start, start + pageSize);
  const eligible = visible.filter((c) => c.consent === 'Opted in');
  function toggle(ids, add) {
    setSelected((prev) =>
      add
        ? [...new Set([...prev, ...ids])]
        : prev.filter((id) => !ids.includes(id)),
    );
  }
  function closeCsv() {
    readGeneration.current++;
    setCsv(null);
    setPreview(null);
    setBusy(false);
  }
  function open(contact) {
    setFieldError(null);
    setEdit({ ...contact });
    setVars(Object.entries(contact.variables));
    setCsv(null);
    setError('');
  }
  function save(e) {
    e.preventDefault();
    const issue = validateContact(edit, directory);
    if (issue) {
      const field = !edit.name.trim()
        ? 'name'
        : !consentStates.includes(edit.consent)
          ? 'consent'
          : 'phone';
      setFieldError({ field, message: issue });
      e.currentTarget.elements.namedItem(field)?.focus();
      return;
    }
    const keys = vars.map(([key]) => key.trim());
    const badKey = keys.findIndex(
      (key, i) => !/^[a-zA-Z0-9_]+$/.test(key) || keys.indexOf(key) !== i,
    );
    if (badKey >= 0) {
      const field = 'key-' + badKey;
      setFieldError({
        field,
        message: 'Use a unique key containing letters, numbers or underscores.',
      });
      e.currentTarget.elements.namedItem(field)?.focus();
      return;
    }
    const contact = {
      ...edit,
      name: edit.name.trim(),
      id: edit.id || crypto.randomUUID(),
      variables: Object.fromEntries(
        vars.map(([, value], i) => [keys[i], value.trim()]),
      ),
    };
    setDirectory((prev) =>
      edit.id
        ? prev.map((c) => (c.id === edit.id ? contact : c))
        : [...prev, contact],
    );
    if (contact.consent !== 'Opted in') toggle([contact.id], false);
    setEdit(null);
    setError('');
  }
  function parse(value) {
    try {
      setPreview(previewCsv(value, directory));
      setError('');
    } catch (e) {
      setPreview(null);
      setError(e.message);
    }
  }
  return (
    <>
      <div className="wa-directory">
        <Panel
          title="Contact directory"
          action={
            <div className="wa-actions">
              <button
                onClick={() => {
                  setCsv('');
                  setPreview(null);
                  setEdit(null);
                  setError('');
                }}
              >
                Import CSV
              </button>
              <button className="primary" onClick={() => open(blank())}>
                Add contact
              </button>
            </div>
          }
        >
          <div className="wa-tools">
            <Field name="Search contacts">
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  search(e.target.value);
                  setPage(0);
                }}
                placeholder="Name or phone number"
              />
            </Field>
            <Field name="Consent filter">
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              >
                {['All', ...consentStates].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <button
              disabled={!selected.length}
              title="Select opted-in recipients to draft a campaign"
              onClick={startCampaign}
            >
              Draft for selected ({selected.length})
            </button>
          </div>
          <Table
            columns={[
              <input
                type="checkbox"
                aria-label="Select all visible opted-in contacts"
                disabled={!eligible.length}
                ref={(node) => {
                  if (node)
                    node.indeterminate =
                      eligible.some((c) => selected.includes(c.id)) &&
                      !eligible.every((c) => selected.includes(c.id));
                }}
                checked={
                  !!eligible.length &&
                  eligible.every((c) => selected.includes(c.id))
                }
                onChange={(e) =>
                  toggle(
                    eligible.map((c) => c.id),
                    e.target.checked,
                  )
                }
              />,
              'Contact',
              'Phone',
              'Consent',
              'Actions',
            ]}
            empty={
              query || filter !== 'All'
                ? 'No contacts match these filters.'
                : 'Add a contact or import a sample CSV to start your directory.'
            }
            rows={visible.map((c) => ({
              id: c.id,
              cells: [
                <input
                  type="checkbox"
                  aria-label={'Select ' + c.name}
                  disabled={c.consent !== 'Opted in'}
                  checked={selected.includes(c.id)}
                  onChange={(e) => toggle([c.id], e.target.checked)}
                />,
                <div className="wa-contact-identity">
                  <strong>{c.name}</strong>
                  <small>{c.phone}</small>
                </div>,
                c.phone,
                <Status>{c.consent}</Status>,
                <button
                  className="wa-cell-action"
                  aria-label={'Edit ' + c.name}
                  onClick={() => open(c)}
                >
                  Edit
                </button>,
              ],
            }))}
          />
          <footer className="wa-directory-foot">
            <span role="status">
              {matches.length
                ? `${start + 1}–${start + visible.length} of ${matches.length}`
                : '0'}{' '}
              contacts
            </span>
            {(query || filter !== 'All') && (
              <button
                onClick={() => {
                  search('');
                  setFilter('All');
                  setPage(0);
                }}
              >
                Clear filters
              </button>
            )}
            {lastPage > 0 && (
              <nav aria-label="Contact pages">
                <button
                  disabled={!currentPage}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === lastPage}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </footer>
        </Panel>
      </div>
      {edit && (
        <EditorDialog
          title={edit.id ? 'Edit contact' : 'New contact'}
          onClose={() => setEdit(null)}
        >
          <form noValidate onSubmit={save} onChange={() => setFieldError(null)}>
            <div className="wa-fields">
              <Field
                name="Contact name"
                error={fieldError?.field === 'name' && fieldError.message}
              >
                <input
                  name="name"
                  required
                  data-initial-focus
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
              <Field
                name="Phone number"
                error={fieldError?.field === 'phone' && fieldError.message}
              >
                <input
                  name="phone"
                  type="tel"
                  required
                  placeholder="+12025550100"
                  value={edit.phone}
                  onChange={(e) =>
                    setEdit({ ...edit, phone: e.target.value.trim() })
                  }
                />
              </Field>
              <Field
                name="Consent status"
                error={fieldError?.field === 'consent' && fieldError.message}
              >
                <select
                  name="consent"
                  value={edit.consent}
                  onChange={(e) =>
                    setEdit({ ...edit, consent: e.target.value })
                  }
                >
                  {consentStates.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <h4>Template variables</h4>
            {vars.map(([key, value], i) => (
              <div className="wa-tools" key={i}>
                {[key, value].map((v, col) => (
                  <Field
                    key={col}
                    name={(col ? 'Value ' : 'Key ') + (i + 1)}
                    error={
                      !col &&
                      fieldError?.field === 'key-' + i &&
                      fieldError.message
                    }
                  >
                    <input
                      name={(col ? 'value-' : 'key-') + i}
                      value={v}
                      onChange={(e) =>
                        setVars(
                          vars.map((pair, index) =>
                            index === i
                              ? pair.map((item, j) =>
                                  j === col ? e.target.value : item,
                                )
                              : pair,
                          ),
                        )
                      }
                    />
                  </Field>
                ))}
              </div>
            ))}
            <div className="wa-editor-footer">
              <button
                type="button"
                onClick={() => setVars([...vars, ['', '']])}
              >
                Add variable
              </button>
              <button type="button" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="primary">Save contact</button>
            </div>
          </form>
        </EditorDialog>
      )}
      {csv !== null && (
        <EditorDialog title="CSV import preview" onClose={closeCsv}>
          <p>
            Use synthetic contacts only. Include name, phone and consent. Prefix
            variable columns with var_.
          </p>
          <Field name="Sample CSV file">
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const generation = ++readGeneration.current;
                setPreview(null);
                if (file.size > 100000) return setError('File exceeds 100 KB.');
                setBusy(true);
                try {
                  const value = await file.text();
                  if (readGeneration.current !== generation) return;
                  setCsv(value);
                  parse(value);
                } catch {
                  if (readGeneration.current === generation)
                    setError('Could not read the CSV file.');
                } finally {
                  if (readGeneration.current === generation) setBusy(false);
                }
              }}
            />
          </Field>
          <Field name="CSV text">
            <textarea
              data-initial-focus
              disabled={busy}
              value={csv}
              placeholder={
                'name,phone,consent,var_period\nSample Co,+12025550185,Opted in,April'
              }
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(null);
                setError('');
              }}
            />
          </Field>
          <button disabled={busy} onClick={() => parse(csv)}>
            {busy ? 'Reading CSV…' : 'Preview CSV'}
          </button>
          <Notice>{error}</Notice>
          {preview && (
            <>
              <p role="status">
                {preview.filter((r) => !r.error).length} valid of{' '}
                {preview.length} rows.
              </p>
              <div className="wa-csv-results">
                <Table
                  columns={['Name', 'Phone', 'Validation']}
                  rows={preview.map(({ contact, error }, i) => ({
                    id: i,
                    cells: [
                      contact.name || 'Missing name',
                      contact.phone || 'Missing phone',
                      error || 'Valid',
                    ],
                  }))}
                />
              </div>
              <button
                disabled={preview.some((r) => r.error)}
                onClick={() => {
                  setDirectory([
                    ...directory,
                    ...preview.map((r) => ({
                      ...r.contact,
                      id: crypto.randomUUID(),
                    })),
                  ]);
                  closeCsv();
                }}
              >
                Import {preview.length} sample contacts
              </button>
            </>
          )}
        </EditorDialog>
      )}
    </>
  );
}
