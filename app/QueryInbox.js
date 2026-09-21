'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getQueries,
  saveQuery,
  createQuery,
  updateQuery,
  acknowledgeQuery,
  assignQuery,
  escalateQuery,
  resolveQuery,
  addNote,
  deleteQuery,
  clearAllQueries,
  getQueryStats,
  subscribeToQueries,
  getTeamMembers,
  subscribeToTeam,
} from './queryStore';

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */

const STATUSES = ['New', 'Acknowledged', 'In Progress', 'Escalated', 'Resolved'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const SOURCES = ['All', 'Personal', 'Group'];

const STATUS_COLORS = {
  New: '#3b82f6',
  Acknowledged: '#a855f7',
  'In Progress': '#f59e0b',
  Escalated: '#ef4444',
  Resolved: '#22c55e',
};

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text, length = 80) {
  if (!text) return '';
  return text.length > length ? text.slice(0, length) + '...' : text;
}

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */

export default function QueryInbox() {
  const [queries, setQueries] = useState([]);
  const [team, setTeam] = useState([]);
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [showAddDemo, setShowAddDemo] = useState(false);

  /* Load data and subscribe to changes */
  const refreshData = useCallback(() => {
    setQueries(getQueries());
    setTeam(getTeamMembers());
  }, []);

  useEffect(() => {
    refreshData();
    const unsubQueries = subscribeToQueries(refreshData);
    const unsubTeam = subscribeToTeam(refreshData);
    return () => {
      unsubQueries();
      unsubTeam();
    };
  }, [refreshData]);

  /* Poll server webhook endpoint for incoming queries from extension */
  useEffect(() => {
    let isMounted = true;
    const pollServerQueries = async () => {
      try {
        const res = await fetch('/api/webhook/whatsapp');
        if (!res.ok) return;
        const data = await res.json();
        if (data.queries && Array.isArray(data.queries) && data.queries.length > 0) {
          const localQueries = getQueries();
          const localIds = new Set(localQueries.map((q) => q.id));
          let hasNew = false;
          data.queries.forEach((serverQ) => {
            if (!localIds.has(serverQ.id)) {
              saveQuery(serverQ);
              hasNew = true;
            }
          });
          if (hasNew && isMounted) {
            refreshData();
          }
        }
      } catch {
        /* Ignore network or offline glitches */
      }
    };

    pollServerQueries();
    const interval = setInterval(pollServerQueries, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [refreshData]);

  /* Keep selected query synced */
  useEffect(() => {
    if (selectedQuery) {
      const fresh = queries.find((q) => q.id === selectedQuery.id);
      if (fresh) setSelectedQuery(fresh);
      else setSelectedQuery(null);
    }
  }, [queries]);

  /* Stats */
  const stats = useMemo(() => getQueryStats(), [queries]);

  /* Filtered queries */
  const filteredQueries = useMemo(() => {
    return queries.filter((q) => {
      if (statusFilter !== 'All' && q.status !== statusFilter) return false;
      if (sourceFilter !== 'All' && q.source?.toLowerCase() !== sourceFilter.toLowerCase()) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          (q.senderName || '').toLowerCase().includes(term) ||
          (q.senderNumber || '').toLowerCase().includes(term) ||
          (q.message || '').toLowerCase().includes(term) ||
          (q.groupName || '').toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [queries, statusFilter, sourceFilter, searchTerm]);

  /* Actions */
  const handleAcknowledge = (id) => {
    acknowledgeQuery(id);
    refreshData();
  };

  const handleAssign = (id, assignTo) => {
    assignQuery(id, assignTo);
    refreshData();
  };

  const handleEscalate = (id, escalateTo) => {
    escalateQuery(id, escalateTo);
    refreshData();
  };

  const handleResolve = (id) => {
    resolveQuery(id);
    refreshData();
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this query?')) {
      deleteQuery(id);
      if (selectedQuery?.id === id) setSelectedQuery(null);
      refreshData();
    }
  };

  const handleAddNote = (id, text) => {
    if (!text.trim()) return;
    addNote(id, text.trim(), 'Team');
    refreshData();
  };

  const handlePriorityChange = (id, priority) => {
    updateQuery(id, { priority });
    refreshData();
  };

  const handleMarkRead = (id) => {
    updateQuery(id, { isRead: true });
    refreshData();
  };

  const handleSelectQuery = (query) => {
    if (!query.isRead) {
      updateQuery(query.id, { isRead: true });
    }
    setSelectedQuery(query);
    refreshData();
  };

  /* Add demo data for testing */
  const addDemoQueries = () => {
    const demos = [
      {
        senderName: 'Rajesh Kumar',
        senderNumber: '+91-98765-43210',
        message: 'Sir, please share the ITR acknowledgment for AY 2025-26. I need it urgently for my loan application with HDFC Bank.',
        source: 'personal',
        groupName: '',
      },
      {
        senderName: 'Priya Sharma',
        senderNumber: '+91-87654-32109',
        message: 'GST notice received from department for FY 2024-25. GSTR-3B mismatch showing Rs 2.5 lakh difference. Please check and advise.',
        source: 'group',
        groupName: 'GRA - Sharma Enterprises',
      },
      {
        senderName: 'Amit Gupta',
        senderNumber: '+91-76543-21098',
        message: 'Need to file TDS return for Q2. All challans are paid. When can we expect it to be done?',
        source: 'personal',
        groupName: '',
      },
      {
        senderName: 'Sunita Agarwal',
        senderNumber: '+91-65432-10987',
        message: 'Please send the balance sheet and P&L for March 2026. The bank is asking for updated financials for CC limit renewal.',
        source: 'group',
        groupName: 'GRA - Agarwal Trading',
      },
      {
        senderName: 'Vikram Singh',
        senderNumber: '+91-54321-09876',
        message: 'Hello sir, I want to register a new company. What documents do I need? Can you guide me on the process and charges?',
        source: 'personal',
        groupName: '',
      },
    ];

    demos.forEach((demo) => createQuery(demo));
    refreshData();
    setShowAddDemo(false);
  };

  return (
    <div className="queryInboxContainer">
      {/* Header */}
      <div className="queryInboxHeader">
        <div className="queryInboxTitle">
          <h1>Query Inbox</h1>
          <span className="queryInboxSubtitle">
            WhatsApp client queries and follow-ups
          </span>
        </div>

        <div className="queryInboxActions">
          <button
            className="queryDemoBtn"
            onClick={() => setShowAddDemo(true)}
            title="Add test queries"
          >
            + Test Data
          </button>

          {queries.length > 0 && (
            <button
              className="queryClearBtn"
              onClick={() => {
                if (window.confirm('Clear all queries?')) {
                  clearAllQueries();
                  setSelectedQuery(null);
                  refreshData();
                }
              }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="queryStatsRow">
        {[
          ['New', stats.new, '#3b82f6'],
          ['In Progress', stats.inProgress, '#f59e0b'],
          ['Escalated', stats.escalated, '#ef4444'],
          ['Resolved', stats.resolved, '#22c55e'],
          ['Total', stats.total, '#8b5cf6'],
        ].map(([label, count, color]) => (
          <div
            className="queryStatCard"
            key={label}
            onClick={() =>
              setStatusFilter(label === 'Total' ? 'All' : label)
            }
          >
            <div className="queryStatDot" style={{ background: color }} />
            <div className="queryStatNum">{count}</div>
            <div className="queryStatLabel">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="queryFilters">
        <div className="queryFilterTabs">
          {['All', ...STATUSES].map((status) => (
            <button
              key={status}
              className={`queryFilterTab ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status}
              {status !== 'All' && (
                <span className="queryFilterCount">
                  {queries.filter((q) =>
                    status === 'All' ? true : q.status === status
                  ).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="queryFilterRight">
          <select
            className="querySourceFilter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All Sources' : `${s} Chat`}
              </option>
            ))}
          </select>

          <input
            className="querySearchInput"
            type="text"
            placeholder="Search queries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="queryMainArea">
        {/* Query List */}
        <div className="queryListPanel">
          {filteredQueries.length === 0 ? (
            <div className="queryEmptyState">
              <div className="queryEmptyIcon">📭</div>
              <h3>No queries found</h3>
              <p>
                {queries.length === 0
                  ? 'When WhatsApp messages arrive via the webhook, they will appear here. Add test data to see how it works.'
                  : 'No queries match your current filters.'}
              </p>
              {queries.length === 0 && (
                <button
                  className="queryEmptyBtn"
                  onClick={addDemoQueries}
                >
                  + Add Test Queries
                </button>
              )}
            </div>
          ) : (
            filteredQueries.map((query) => (
              <div
                key={query.id}
                className={`queryRow ${selectedQuery?.id === query.id ? 'selected' : ''} ${!query.isRead ? 'unread' : ''}`}
                onClick={() => handleSelectQuery(query)}
              >
                <div className="queryRowLeft">
                  <div className="queryAvatar">
                    {(query.senderName || '?')[0].toUpperCase()}
                  </div>
                  <div className="queryRowInfo">
                    <div className="queryRowTop">
                      <strong className="querySenderName">
                        {query.senderName || 'Unknown'}
                      </strong>
                      <span className="queryRowTime">
                        {timeAgo(query.receivedAt)}
                      </span>
                    </div>
                    <div className="queryRowMessage">
                      {truncate(query.message, 90)}
                    </div>
                    <div className="queryRowMeta">
                      <span
                        className="queryStatusBadge"
                        style={{
                          background: `${STATUS_COLORS[query.status]}18`,
                          color: STATUS_COLORS[query.status],
                        }}
                      >
                        {query.status}
                      </span>
                      {query.source === 'group' && (
                        <span className="queryGroupBadge">
                          {query.groupName || 'Group'}
                        </span>
                      )}
                      {query.priority !== 'Normal' && (
                        <span
                          className={`queryPriorityBadge ${query.priority.toLowerCase()}`}
                        >
                          {query.priority}
                        </span>
                      )}
                      {query.assignedTo && (
                        <span className="queryAssignBadge">
                          → {query.assignedTo}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!query.isRead && <div className="queryUnreadDot" />}
              </div>
            ))
          )}
        </div>

        {/* Query Detail Panel */}
        {selectedQuery ? (
          <QueryDetail
            query={selectedQuery}
            team={team}
            onAcknowledge={handleAcknowledge}
            onAssign={handleAssign}
            onEscalate={handleEscalate}
            onResolve={handleResolve}
            onDelete={handleDelete}
            onAddNote={handleAddNote}
            onPriorityChange={handlePriorityChange}
            onClose={() => setSelectedQuery(null)}
          />
        ) : (
          <div className="queryDetailEmpty">
            <div className="queryDetailEmptyIcon">💬</div>
            <h3>Select a query</h3>
            <p>Click on a query from the list to view details and take action.</p>
          </div>
        )}
      </div>

      {/* Add Demo Modal */}
      {showAddDemo && (
        <div
          className="modalOverlay"
          onClick={() => setShowAddDemo(false)}
        >
          <div
            className="queryDemoModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modalClose"
              onClick={() => setShowAddDemo(false)}
            >
              x
            </button>

            <h2>Add Test Queries</h2>

            <p>
              This will add 5 sample client queries to test the inbox. These simulate
              real WhatsApp messages from clients asking about ITR, GST notices, TDS,
              balance sheets, and company registration.
            </p>

            <div className="queryDemoActions">
              <button
                className="queryDemoConfirmBtn"
                onClick={addDemoQueries}
              >
                Add 5 Test Queries
              </button>

              <button
                className="queryDemoCancelBtn"
                onClick={() => setShowAddDemo(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   QUERY DETAIL COMPONENT
--------------------------------------------------------- */

function QueryDetail({
  query,
  team,
  onAcknowledge,
  onAssign,
  onEscalate,
  onResolve,
  onDelete,
  onAddNote,
  onPriorityChange,
  onClose,
}) {
  const [noteText, setNoteText] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);

  const activeTeam = team.filter((m) => m.active);

  return (
    <div className="queryDetailPanel">
      {/* Detail Header */}
      <div className="queryDetailHeader">
        <div className="queryDetailHeaderLeft">
          <div
            className="queryDetailAvatar"
            style={{
              background: STATUS_COLORS[query.status] || '#6b7280',
            }}
          >
            {(query.senderName || '?')[0].toUpperCase()}
          </div>

          <div>
            <h2 className="queryDetailName">{query.senderName}</h2>
            <span className="queryDetailNumber">{query.senderNumber}</span>
          </div>
        </div>

        <button className="queryDetailCloseBtn" onClick={onClose}>
          x
        </button>
      </div>

      {/* Status Bar */}
      <div className="queryDetailStatusBar">
        <span
          className="queryDetailStatusPill"
          style={{
            background: `${STATUS_COLORS[query.status]}18`,
            color: STATUS_COLORS[query.status],
            borderColor: `${STATUS_COLORS[query.status]}40`,
          }}
        >
          {query.status}
        </span>

        <select
          className="queryDetailPriority"
          value={query.priority}
          onChange={(e) => onPriorityChange(query.id, e.target.value)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p} Priority
            </option>
          ))}
        </select>

        <span className="queryDetailSource">
          {query.source === 'group' ? `Group: ${query.groupName}` : 'Personal Chat'}
        </span>

        <span className="queryDetailTime">
          {formatDateTime(query.receivedAt)}
        </span>
      </div>

      {/* Message Content */}
      <div className="queryDetailMessage">
        <div className="queryDetailMessageLabel">Message</div>
        <div className="queryDetailMessageText">{query.message}</div>
      </div>

      {/* Action Buttons */}
      <div className="queryDetailActions">
        {query.status === 'New' && (
          <button
            className="queryActionBtn acknowledge"
            onClick={() => onAcknowledge(query.id)}
          >
            ✓ Acknowledge
          </button>
        )}

        {query.status !== 'Resolved' && (
          <>
            <button
              className="queryActionBtn assign"
              onClick={() => setShowAssign(!showAssign)}
            >
              👤 Assign
            </button>

            <button
              className="queryActionBtn escalate"
              onClick={() => setShowEscalate(!showEscalate)}
            >
              ↑ Escalate
            </button>

            <button
              className="queryActionBtn resolve"
              onClick={() => onResolve(query.id)}
            >
              ✓ Resolve
            </button>
          </>
        )}

        <button
          className="queryActionBtn delete"
          onClick={() => onDelete(query.id)}
        >
          Delete
        </button>
      </div>

      {/* Assign Dropdown */}
      {showAssign && (
        <div className="queryAssignDropdown">
          <div className="queryAssignTitle">Assign to:</div>
          {activeTeam.length > 0 ? (
            activeTeam.map((member) => (
              <button
                key={member.id}
                className="queryAssignOption"
                onClick={() => {
                  onAssign(query.id, member.name);
                  setShowAssign(false);
                }}
              >
                <span className="queryAssignAvatar">
                  {member.name[0].toUpperCase()}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.role}</small>
                </div>
              </button>
            ))
          ) : (
            <div className="queryAssignEmpty">
              No team members added yet. Go to Settings to add your team.
            </div>
          )}
        </div>
      )}

      {/* Escalate Dropdown */}
      {showEscalate && (
        <div className="queryAssignDropdown">
          <div className="queryAssignTitle">Escalate to:</div>
          {activeTeam
            .filter((m) => m.role === 'Senior' || m.role === 'Partner')
            .length > 0 ? (
            activeTeam
              .filter((m) => m.role === 'Senior' || m.role === 'Partner')
              .map((member) => (
                <button
                  key={member.id}
                  className="queryAssignOption"
                  onClick={() => {
                    onEscalate(query.id, member.name);
                    setShowEscalate(false);
                  }}
                >
                  <span className="queryAssignAvatar">
                    {member.name[0].toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.name}</strong>
                    <small>{member.role}</small>
                  </div>
                </button>
              ))
          ) : (
            <div className="queryAssignEmpty">
              No seniors or partners added. Go to Settings to add team members with Senior or Partner role.
            </div>
          )}
        </div>
      )}

      {/* Assignment Info */}
      {query.assignedTo && (
        <div className="queryDetailInfoRow">
          <span className="queryDetailInfoLabel">Assigned to:</span>
          <span className="queryDetailInfoValue">{query.assignedTo}</span>
        </div>
      )}

      {query.escalatedTo && (
        <div className="queryDetailInfoRow">
          <span className="queryDetailInfoLabel">Escalated to:</span>
          <span className="queryDetailInfoValue">{query.escalatedTo}</span>
        </div>
      )}

      {query.resolvedAt && (
        <div className="queryDetailInfoRow">
          <span className="queryDetailInfoLabel">Resolved at:</span>
          <span className="queryDetailInfoValue">
            {formatDateTime(query.resolvedAt)}
          </span>
        </div>
      )}

      {/* Notes Section */}
      <div className="queryNotesSection">
        <h3 className="queryNotesTitle">Internal Notes</h3>

        <div className="queryNoteInput">
          <textarea
            className="queryNoteTextarea"
            placeholder="Add a note about this query..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onAddNote(query.id, noteText);
                setNoteText('');
              }
            }}
          />
          <button
            className="queryNoteSubmit"
            onClick={() => {
              onAddNote(query.id, noteText);
              setNoteText('');
            }}
            disabled={!noteText.trim()}
          >
            Add Note
          </button>
        </div>

        {(query.notes || []).length > 0 ? (
          <div className="queryNotesList">
            {[...(query.notes || [])].reverse().map((note) => (
              <div key={note.id} className="queryNoteItem">
                <div className="queryNoteHeader">
                  <strong>{note.author}</strong>
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
                <div className="queryNoteText">{note.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="queryNotesEmpty">No notes added yet.</div>
        )}
      </div>
    </div>
  );
}
