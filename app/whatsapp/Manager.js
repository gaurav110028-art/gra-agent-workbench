'use client';

import { useEffect, useState } from 'react';
import * as icons from '../NavIcons';
import { workspaceDestination, workspaceViews } from '../access-destinations';
import * as demo from './demo.mjs';
import { Field, Panel, Status, Table, stamp } from './Controls';
import { Contacts } from './Contacts';
import { Campaigns, Templates } from './Campaigns';
import { Reminders } from './Reminders';
import './manager.css';

const sections = [
  'Overview',
  'Contacts',
  'Templates',
  'Bulk Campaigns',
  'Automated Reminders',
  'Message Logs',
  'Integrations',
];
const nav = [
  ['Document Redactor', '/redactor', icons.SheetIcon],
  ['WhatsApp Automation', '/whatsapp', icons.LockIcon],
  ['Data migration', '/workspace/migration', icons.LockIcon],
  ['Agents', '/workspace', icons.AgentsIcon],
  ...Object.entries({
    architect: icons.AgentsIcon,
    queryInbox: icons.InboxIcon,
    runs: icons.RunsIcon,
    approvals: icons.ApprovalsIcon,
    settings: icons.SettingsIcon,
    calendar: icons.CalendarIcon,
  }).map(([key, Icon]) => [
    workspaceViews[key],
    workspaceDestination(key),
    Icon,
  ]),
];

function LogTable({ entries, directory, sources, compact }) {
  const [query, search] = useState(''),
    [filter, setFilter] = useState('All');
  const rows = entries
    .map((l) => {
      const name =
        directory.find((c) => c.id === l.contact)?.name || 'Unknown contact';
      const reference =
        sources.find((s) => s.id === l.source)?.name || l.source;
      return { ...l, name, reference };
    })
    .filter(
      (l) =>
        (filter === 'All' || filter === l.result) &&
        [
          l.name,
          l.template,
          l.provider,
          l.reference,
          l.error,
          l.time,
          stamp(l.time),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.time.localeCompare(a.time));
  return (
    <>
      {!compact && (
        <div className="wa-tools">
          <Field name="Search message logs">
            <input
              type="search"
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Recipient, template or reference"
            />
          </Field>
          <Field name="Result filter">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['All', 'Submitted', 'Failed'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {!compact && (
        <p className="wa-filter-count" role="status">
          {rows.length} of {entries.length} attempts
        </p>
      )}
      <Table
        columns={
          compact
            ? ['Recipient', 'Attempt time', 'Sample result', 'Details']
            : [
                'Recipient / template',
                'Attempt time',
                'Sample result',
                'Error details',
                'Reference / provider ID',
              ]
        }
        rows={(compact ? rows.slice(0, 4) : rows).map((l) => ({
          id: l.id,
          cells: [
            compact ? (
              l.name
            ) : (
              <div className="wa-cell-stack">
                <strong>{l.name}</strong>
                <small>{l.template}</small>
              </div>
            ),
            <time dateTime={l.time}>{stamp(l.time)}</time>,
            <Status>{l.result}</Status>,
            compact ? l.error || l.reference : l.error || '—',
            ...(!compact
              ? [
                  <div className="wa-cell-stack">
                    {l.reference}
                    <small>{l.provider || 'No provider ID'}</small>
                  </div>,
                ]
              : []),
          ],
        }))}
      />
      {!compact && !rows.length && (query || filter !== 'All') && (
        <button
          onClick={() => {
            search('');
            setFilter('All');
          }}
        >
          Clear filters
        </button>
      )}
    </>
  );
}

function Overview({ directory, campaigns, reminders, logs, go }) {
  const upcoming = reminders
    .filter(demo.nextEligible)
    .sort(
      (a, b) =>
        Date.parse(demo.nextEligible(a)) - Date.parse(demo.nextEligible(b)),
    );
  const metrics = [
    ['Total contacts', directory.length, 'Contacts'],
    [
      'Active campaigns',
      campaigns.filter((c) => c.status === 'Active sample').length,
      'Bulk Campaigns',
    ],
    ['Scheduled reminders', upcoming.length, 'Automated Reminders'],
    ['Message attempts', logs.length, 'Message Logs'],
    [
      'Submitted messages',
      logs.filter((l) => l.result === 'Submitted').length,
      'Message Logs',
    ],
    [
      'Failed attempts',
      logs.filter((l) => l.result === 'Failed').length,
      'Message Logs',
    ],
  ];
  return (
    <>
      <div className="wa-metrics" aria-label="Sample totals">
        {metrics.map(([label, value, section]) => (
          <button key={label} onClick={() => go(section)}>
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </div>
      <div className="wa-columns">
        <Panel
          title="Upcoming reminders"
          action={
            <button
              className="wa-link"
              onClick={() => go('Automated Reminders')}
            >
              Configure reminders
            </button>
          }
        >
          {upcoming.length ? (
            upcoming.slice(0, 4).map((r) => {
              const next = demo.nextEligible(r);
              const date = new Date(next);
              return (
                <div className="wa-row" key={r.id}>
                  <time
                    className="wa-date"
                    dateTime={next}
                    aria-label={stamp(next)}
                  >
                    <span>
                      {date.toLocaleString('en-GB', {
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </span>
                    <b>{date.getUTCDate()}</b>
                  </time>
                  <div className="wa-row-body">
                    <strong>{r.name}</strong>
                    <small>
                      {directory.find((c) => c.id === r.contact)?.name ||
                        'Unknown contact'}
                    </small>
                  </div>
                  <div className="wa-row-end">
                    {next.slice(11, 16)} UTC
                    <small>
                      Every {r.days} {r.days === 1 ? 'day' : 'days'}
                    </small>
                  </div>
                </div>
              );
            })
          ) : (
            <p>No enabled reminders.</p>
          )}
        </Panel>
        <Panel
          title="Campaign activity"
          action={
            <button className="wa-link" onClick={() => go('Bulk Campaigns')}>
              View campaigns
            </button>
          }
        >
          {campaigns
            .slice(-3)
            .reverse()
            .map((c) => (
              <div className="wa-row" key={c.id}>
                <div className="wa-row-body">
                  <strong>{c.name}</strong>
                  <small>{c.recipients.length} recipients</small>
                </div>
                <Status>{c.status}</Status>
              </div>
            ))}
        </Panel>
      </div>
      <Panel
        title="Recent message attempts"
        action={
          <button className="wa-link" onClick={() => go('Message Logs')}>
            View logs
          </button>
        }
      >
        <LogTable
          entries={logs}
          directory={directory}
          sources={[...campaigns, ...reminders]}
          compact
        />
      </Panel>
    </>
  );
}

export default function Manager() {
  const [section, go] = useState('Overview'),
    [theme, setTheme] = useState('dark'),
    [collapsed, collapse] = useState(false),
    [mobileNav, setMobileNav] = useState(false);
  const [directory, setDirectory] = useState(demo.contacts),
    [catalog, setCatalog] = useState(demo.templates),
    [selected, setSelected] = useState([]);
  const [campaigns, setCampaigns] = useState(demo.campaigns),
    [reminders, setReminders] = useState(demo.reminders),
    [logs, setLogs] = useState(demo.logs);
  useEffect(() => {
    try {
      if (localStorage.getItem('gra-theme') === 'light') setTheme('light');
    } catch {}
  }, []);
  return (
    <div
      className={
        'workbench wa-shell ' +
        (collapsed ? 'sidebarCollapsed ' : '') +
        (theme === 'light' ? 'lightTheme' : 'darkTheme')
      }
      data-theme={theme}
    >
      <a className="wa-skip" href="#wa-content">
        Skip to manager
      </a>
      <button
        className="wa-mobile-menu"
        aria-expanded={mobileNav}
        aria-controls="wa-workbench-nav"
        onClick={() => setMobileNav(!mobileNav)}
      >
        <icons.AgentsIcon /> Workbench navigation{' '}
        <icons.ChevronIcon direction={mobileNav ? 'left' : 'right'} />
      </button>
      <aside
        id="wa-workbench-nav"
        className={'sidebar' + (mobileNav ? ' wa-mobile-open' : '')}
      >
        <button
          className="sidebarToggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => collapse(!collapsed)}
        >
          <icons.ChevronIcon direction={collapsed ? 'right' : 'left'} />
        </button>
        <div className="brand" />
        <nav className="nav" aria-label="Workbench">
          {nav.map(([name, href, Icon]) => (
            <a
              key={name}
              className={'navItem ' + (href === '/whatsapp' ? 'active' : '')}
              aria-label={name}
              aria-current={href === '/whatsapp' ? 'page' : undefined}
              title={name}
              href={href}
            >
              <span className="navIcon">
                <Icon />
              </span>
              <span className="sidebarNavLabel">{name}</span>
            </a>
          ))}
        </nav>
        <div className="sidebarBottom">
          <a className="navItem" href="/logout" aria-label="Sign out">
            <span className="navIcon">
              <icons.LockIcon />
            </span>
            <span className="sidebarNavLabel">Sign out</span>
          </a>
          <button
            className="navItem"
            aria-label="Switch theme"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
              try {
                localStorage.setItem('gra-theme', next);
              } catch {}
            }}
          >
            <span className="navIcon">
              {theme === 'dark' ? <icons.SunIcon /> : <icons.MoonIcon />}
            </span>
            <span className="sidebarNavLabel">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
        </div>
      </aside>
      <main className="wa-main" id="wa-content" tabIndex={-1}>
        <header className="wa-heading">
          <div className="wa-breadcrumb">
            <a href="/workspace">Workbench</a>
            <span aria-hidden="true">/</span>
            <h1>WhatsApp Automation</h1>
          </div>
          <span className="wa-mode">
            <icons.LockIcon /> Simulation only
          </span>
        </header>
        <div
          className="wa-tabs"
          role="navigation"
          aria-label="WhatsApp sections"
        >
          {sections.map((s) => (
            <button
              key={s}
              aria-current={section === s ? 'page' : undefined}
              onClick={() => go(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="wa-section">
          <div>
            <h2>{section}</h2>
            <p className="wa-note">
              Synthetic data. Changes last until reload. Live sending is off.
            </p>
          </div>
          {section === 'Overview' && (
            <div className="wa-actions">
              <button onClick={() => go('Contacts')}>Manage contacts</button>
              <button className="primary" onClick={() => go('Bulk Campaigns')}>
                Create campaign
              </button>
            </div>
          )}
        </div>
        {section === 'Overview' && (
          <Overview {...{ directory, campaigns, reminders, logs, go }} />
        )}
        {section === 'Contacts' && (
          <Contacts
            {...{ directory, setDirectory, selected, setSelected }}
            startCampaign={() => go('Bulk Campaigns')}
          />
        )}
        {section === 'Templates' && (
          <Templates catalog={catalog} add={setCatalog} />
        )}
        {section === 'Bulk Campaigns' && (
          <Campaigns
            {...{ catalog, directory, campaigns, setCampaigns }}
            initialRecipients={selected}
          />
        )}
        {section === 'Automated Reminders' && (
          <Reminders
            items={reminders}
            setItems={setReminders}
            {...{ directory, catalog, logs, setLogs }}
          />
        )}
        {section === 'Message Logs' && (
          <Panel title="Sample message attempts">
            <LogTable
              entries={logs}
              directory={directory}
              sources={[...campaigns, ...reminders]}
            />
          </Panel>
        )}
        {section === 'Integrations' && (
          <Panel title="Connection settings">
            {[
              [
                'BizAutomation',
                'Provider connection',
                'Disconnected',
                icons.WebhookIcon,
              ],
              [
                'WhatsApp sender',
                'Sender number and business account',
                'Not configured',
                icons.UsersIcon,
              ],
              [
                'Approved-template synchronization',
                'Catalog supplied manually for this session',
                'Not connected',
                icons.SheetIcon,
              ],
              [
                'Scheduled automation',
                'Manual simulation only',
                'Disabled',
                icons.CalendarIcon,
              ],
            ].map(([name, detail, status, Icon]) => (
              <div className="wa-row" key={name}>
                <span className="wa-setting-icon">
                  <Icon />
                </span>
                <div className="wa-row-body">
                  <strong>{name}</strong>
                  <small>{detail}</small>
                </div>
                <span className="wa-setting-state">{status}</span>
              </div>
            ))}
          </Panel>
        )}
      </main>
    </div>
  );
}
