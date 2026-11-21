import { useId, useLayoutEffect, useRef, useState } from 'react';
import { campaignReview } from './demo.mjs';
import { Field, Panel, Status, Table } from './Controls';
import './campaign.css';

const steps = ['Template', 'Recipients', 'Personalization', 'Review'];

function FieldError({ id, children }) {
  return children ? (
    <p className="wa-field-error" id={id} role="alert">
      {children}
    </p>
  ) : null;
}

export function Templates({ catalog, add }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState('preview');
  const [selected, setSelected] = useState(catalog[0]);
  const [issue, setIssue] = useState('');
  const [saved, setSaved] = useState('');
  const titleId = useId();
  const errorId = useId();

  function open(mode, item) {
    if (item) setSelected(item);
    const form = dialog.current?.querySelector('form');
    form?.reset();
    form?.elements.language.setCustomValidity('');
    setMode(mode);
    setIssue('');
    setSaved('');
    // Render the correct contents before native focus placement.
    requestAnimationFrame(() => dialog.current?.showModal());
  }
  function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = data.get('name').trim();
    if (
      !/^[a-z][a-z0-9_]*$/.test(name) ||
      catalog.some((t) => t.name === name)
    ) {
      setIssue(
        'Use a unique identifier with lowercase letters, digits or underscores.',
      );
      form.elements.name.focus();
      return;
    }
    const language = data.get('language').trim();
    if (!language) {
      form.elements.language.setCustomValidity(
        'Enter the language code from the approved template.',
      );
      form.elements.language.reportValidity();
      return;
    }
    add([
      ...catalog,
      {
        name,
        language,
        count: Number(data.get('count')),
        pdf: data.has('pdf'),
        addedLocally: true,
      },
    ]);
    setSaved('Template metadata added for this session.');
    dialog.current.close();
  }

  return (
    <>
      <Panel
        title="Template catalog"
        action={
          <button className="primary" onClick={() => open('add')}>
            Add template
          </button>
        }
      >
        <Table
          columns={[
            'Template',
            'Body variables',
            'Attachment',
            'Language',
            'Approval',
            'Actions',
          ]}
          rows={catalog.map((template) => ({
            id: template.name,
            cells: [
              <span className="wa-template-name">{template.name}</span>,
              template.count,
              template.pdf ? 'PDF required' : 'None',
              template.language,
              template.addedLocally ? 'Unverified' : 'Owner-confirmed',
              <button
                className="wa-table-action"
                aria-label={'Preview ' + template.name}
                onClick={() => open('preview', template)}
              >
                Preview
              </button>,
            ],
          }))}
        />
        <p className="wa-inline-note">
          Approval reflects the supplied catalog. Provider sync is disconnected.
        </p>
        <p role="status" className="wa-save-status">
          {saved}
        </p>
      </Panel>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="wa-catalog-dialog"
      >
        <header>
          <h3 id={titleId}>
            {mode === 'add' ? 'Add template metadata' : 'Template preview'}
          </h3>
          <button onClick={() => dialog.current.close()}>Close</button>
        </header>
        {mode === 'add' ? (
          <form key="add" onSubmit={save}>
            <Field name="Template identifier">
              <input
                autoFocus
                name="name"
                required
                aria-invalid={issue ? true : undefined}
                aria-describedby={issue ? errorId : undefined}
                onChange={() => setIssue('')}
              />
            </Field>
            <FieldError id={errorId}>{issue}</FieldError>
            <div className="wa-fields">
              <Field name="Language code">
                <input
                  name="language"
                  required
                  onInput={(event) => event.target.setCustomValidity('')}
                />
              </Field>
              <Field name="Body variable count">
                <input
                  type="number"
                  name="count"
                  min="0"
                  max="30"
                  defaultValue="3"
                  required
                />
              </Field>
            </div>
            <label>
              <input type="checkbox" name="pdf" /> PDF attachment required
            </label>
            <p>
              Use the approved template’s metadata. This entry stays in the
              current session.
            </p>
            <button className="primary">Save template metadata</button>
          </form>
        ) : (
          <>
            <h4 className="wa-template-name">{selected.name}</h4>
            <dl className="wa-details">
              {[
                ['Language', selected.language],
                ['Attachment', selected.pdf ? 'PDF required' : 'None'],
                [
                  'Approval',
                  selected.addedLocally ? 'Unverified' : 'Owner-confirmed',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <h4>Body variables</h4>
            <div className="wa-variable-strip">
              {selected.count
                ? Array.from({ length: selected.count }, (_, i) => (
                    <code key={i}>{'{{' + (i + 1) + '}}'}</code>
                  ))
                : 'None'}
            </div>
            <p>Approved message wording is unavailable.</p>
          </>
        )}
      </dialog>
    </>
  );
}

export function Campaigns({
  catalog,
  directory,
  campaigns,
  setCampaigns,
  initialRecipients,
}) {
  const initial = () => ({
    name: '',
    template: catalog[0].name,
    recipients: initialRecipients,
    mapping: [],
    pdf: '',
  });
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState('');
  const [search, setSearch] = useState('');
  const heading = useRef(null);
  const form = useRef(null);
  const id = useId();
  const template = catalog.find((t) => t.name === draft.template);
  const keys = [...new Set(directory.flatMap((c) => Object.keys(c.variables)))];
  const { rows, errors, issues } = campaignReview(draft, directory, template);
  const shown = directory.filter((c) =>
    (c.name + ' ' + c.phone).toLowerCase().includes(search.toLowerCase()),
  );

  const previousStep = useRef(step);
  useLayoutEffect(() => {
    if (checked) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus();
    } else if (previousStep.current !== step) {
      heading.current?.focus();
    }
    previousStep.current = step;
  }, [step, checked]);

  function edit(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved('');
  }
  function move(index) {
    setChecked(false);
    setStep(index);
  }
  function errorProps(issue, key) {
    return checked && issue
      ? { 'aria-invalid': true, 'aria-describedby': id + key }
      : {};
  }
  function advance(event) {
    event.preventDefault();
    const invalid =
      step === 0 ? issues.name : step === 1 ? issues.recipients : errors.length;
    if (invalid) {
      if (checked) form.current?.querySelector('[aria-invalid="true"]')?.focus();
      else setChecked(true);
      return;
    }
    if (step < 3) {
      move(step + 1);
      return;
    }
    setCampaigns((current) => [
      ...current,
      { ...draft, id: crypto.randomUUID(), status: 'Draft', preview: rows },
    ]);
    setSaved('Simulated draft saved for this session.');
    setDraft(initial());
    setSearch('');
    move(0);
  }

  return (
    <>
      <Panel title="Create a campaign">
        <ol className="wa-steps" aria-label="Campaign steps">
          {steps.map((label, i) => (
            <li key={label} aria-current={step === i ? 'step' : undefined}>
              <span aria-hidden="true">{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <form
          ref={form}
          className="wa-campaign-form"
          onSubmit={advance}
          noValidate
        >
          <h4 ref={heading} tabIndex="-1">
            {
              [
                'Choose a template',
                'Select recipients',
                'Map template variables',
                'Review simulated draft',
              ][step]
            }
          </h4>
          {step === 0 && (
            <>
              <div className="wa-fields">
                <div>
                  <Field name="Campaign name">
                    <input
                      value={draft.name}
                      required
                      {...errorProps(issues.name, 'name')}
                      onChange={(e) => edit({ name: e.target.value })}
                    />
                  </Field>
                  <FieldError id={id + 'name'}>
                    {checked && issues.name}
                  </FieldError>
                </div>
                <Field name="Approved template">
                  <select
                    value={draft.template}
                    onChange={(e) =>
                      edit({ template: e.target.value, mapping: [], pdf: '' })
                    }
                  >
                    {catalog.map((t) => (
                      <option key={t.name}>{t.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <dl className="wa-details">
                <div>
                  <dt>Body variables</dt>
                  <dd>{template.count}</dd>
                </div>
                <div>
                  <dt>Attachment</dt>
                  <dd>{template.pdf ? 'PDF required' : 'None'}</dd>
                </div>
                <div>
                  <dt>Language</dt>
                  <dd>{template.language}</dd>
                </div>
              </dl>
            </>
          )}
          {step === 1 && (
            <>
              <Field name="Find recipients">
                <input
                  type="search"
                  value={search}
                  placeholder="Name or phone"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
              <fieldset
                className="wa-recipient-list"
                tabIndex="-1"
                {...errorProps(issues.recipients, 'recipients')}
              >
                <legend>Recipients ({draft.recipients.length} selected)</legend>
                {shown.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      disabled={c.consent !== 'Opted in'}
                      checked={draft.recipients.includes(c.id)}
                      onChange={(e) =>
                        edit({
                          recipients: e.target.checked
                            ? [...draft.recipients, c.id]
                            : draft.recipients.filter(
                                (value) => value !== c.id,
                              ),
                        })
                      }
                    />
                    <span>{c.name}</span>
                    <small>{c.consent}</small>
                  </label>
                ))}
                {!shown.length && <p>No contacts match this search.</p>}
              </fieldset>
              <FieldError id={id + 'recipients'}>
                {checked && issues.recipients}
              </FieldError>
            </>
          )}
          {step === 2 && (
            <>
              <div className="wa-fields">
                {Array.from({ length: template.count }, (_, i) => (
                  <div key={i}>
                    <Field name={'Body variable ' + (i + 1)}>
                      <select
                        value={draft.mapping[i] || ''}
                        required
                        {...errorProps(issues.mappings[i], 'map' + i)}
                        onChange={(e) => {
                          const mapping = [...draft.mapping];
                          mapping[i] = e.target.value;
                          edit({ mapping });
                        }}
                      >
                        <option value="">Choose contact field</option>
                        <option value="name">Contact name</option>
                        <option value="phone">Phone</option>
                        {keys.map((k) => (
                          <option key={k} value={'var:' + k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <FieldError id={id + 'map' + i}>
                      {checked && issues.mappings[i]}
                    </FieldError>
                  </div>
                ))}
              </div>
              {template.pdf && (
                <>
                  <Field name="PDF URL">
                    <input
                      type="url"
                      required
                      placeholder="https://example.invalid/sample.pdf"
                      value={draft.pdf}
                      {...errorProps(issues.pdf, 'pdf')}
                      onChange={(e) => edit({ pdf: e.target.value })}
                    />
                  </Field>
                  <FieldError id={id + 'pdf'}>
                    {checked && issues.pdf}
                  </FieldError>
                </>
              )}
              {!template.pdf && !template.count && (
                <p>This template requires no variables or attachment.</p>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <dl className="wa-details">
                <div>
                  <dt>Campaign</dt>
                  <dd>{draft.name}</dd>
                </div>
                <div>
                  <dt>Template</dt>
                  <dd>{template.name}</dd>
                </div>
                {template.pdf && (
                  <div>
                    <dt>PDF attachment</dt>
                    <dd>{draft.pdf}</dd>
                  </div>
                )}
              </dl>
              <Table
                columns={[
                  'Recipient',
                  ...Array.from(
                    { length: template.count },
                    (_, i) => 'Variable ' + (i + 1),
                  ),
                ]}
                rows={rows.map((row) => ({
                  id: row.id,
                  cells: [row.name, ...row.values],
                }))}
              />
              <p className="wa-inline-note">
                Saving keeps this draft in the current session. No messages will
                be sent.
              </p>
            </>
          )}
          <div className="wa-form-actions">
            {step > 0 && (
              <button type="button" onClick={() => move(step - 1)}>
                Back
              </button>
            )}
            <button className="primary" type="submit">
              {
                [
                  'Continue to recipients',
                  'Continue to personalization',
                  'Review campaign',
                  'Save simulated draft',
                ][step]
              }
            </button>
          </div>
          <p role="status" className="wa-save-status">
            {saved}
          </p>
        </form>
      </Panel>
      <Panel title="Campaign drafts & activity">
        <Table
          columns={['Campaign', 'Template', 'Recipients', 'Status']}
          rows={campaigns.map((c) => ({
            id: c.id,
            cells: [
              c.name,
              <span className="wa-template-name">{c.template}</span>,
              c.recipients.length,
              <Status>{c.status}</Status>,
            ],
          }))}
        />
      </Panel>
    </>
  );
}
