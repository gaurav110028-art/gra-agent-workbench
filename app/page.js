'use client';

import { useEffect, useState } from 'react';
import WorkflowBuilder from './WorkflowBuilder';
import RunsView from './RunsView';
import ApprovalsView from './ApprovalsView';
import SourcesView from './SourcesView';
import QueryInbox from './QueryInbox';
import SettingsView from './SettingsView';
import CalendarView from './CalendarView';
import { getQueryStats, subscribeToQueries } from './queryStore';
import { agentTemplates, seedAgentWorkflow } from './workflowTemplates';
import {
  AgentsIcon,
  InboxIcon,
  RunsIcon,
  ApprovalsIcon,
  SettingsIcon,
  CalendarIcon,
  SunIcon,
  MoonIcon,
  InfoIcon,
  ChevronIcon,
} from './NavIcons';
import GauravChatDrawer from './architect/GauravChatDrawer';

export default function Home() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showSidebarArchitect, setShowSidebarArchitect] = useState(false);

  const [activeView, setActiveView] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('workflow');

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showSiteInfo, setShowSiteInfo] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [queryStats, setQueryStats] = useState({ new: 0, unread: 0, total: 0 });

  const [agentName, setAgentName] = useState('');
  const [agentStatus, setAgentStatus] = useState('paused');
  const [selectedTemplateId, setSelectedTemplateId] = useState('blank');
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('gra-theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedAgents = localStorage.getItem('gra-agents');
    const seeded = localStorage.getItem('gra-agents-seeded');

    let loadedAgents = null;

    if (savedAgents) {
      try {
        loadedAgents = JSON.parse(savedAgents);
      } catch {
        localStorage.removeItem('gra-agents');
      }
    }

    if (Array.isArray(loadedAgents) && loadedAgents.length > 0) {
      setAgents(loadedAgents);
    } else if (!seeded) {
      /* First visit: pre-populate ready-to-run CA & consultancy agents. */
      const base = Date.now();

      const seededAgents = agentTemplates.map((template, index) => {
        const id = base + index;
        seedAgentWorkflow(template.id, id);

        return {
          id,
          name: template.name,
          status: 'paused',
          templateId: template.id,
          category: template.category,
        };
      });

      localStorage.setItem('gra-agents', JSON.stringify(seededAgents));
      localStorage.setItem('gra-agents-seeded', 'true');
      setAgents(seededAgents);
    }

    const savedSidebarState =
      localStorage.getItem('gra-sidebar-collapsed');

    if (savedSidebarState === 'true') {
      setSidebarCollapsed(true);
    }

    /* Load query stats */
    setQueryStats(getQueryStats());
  }, []);

  /* Subscribe to query changes for badge updates */
  useEffect(() => {
    const unsub = subscribeToQueries(() => {
      setQueryStats(getQueryStats());
    });
    return () => unsub();
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;

      localStorage.setItem(
        'gra-sidebar-collapsed',
        String(next)
      );

      return next;
    });
  };

  const saveAgents = (updatedAgents) => {
    setAgents(updatedAgents);

    localStorage.setItem(
      'gra-agents',
      JSON.stringify(updatedAgents)
    );
  };

  const addAgent = () => {
    const template = agentTemplates.find(
      (item) => item.id === selectedTemplateId
    );

    const name = agentName.trim() || template?.name || '';

    if (!name) return;

    const id = Date.now();

    if (template) {
      seedAgentWorkflow(template.id, id);
    }

    const newAgent = {
      id,
      name,
      status: agentStatus,
      ...(template
        ? { templateId: template.id, category: template.category }
        : {}),
    };

    saveAgents([...agents, newAgent]);

    setAgentName('');
    setAgentStatus('paused');
    setSelectedTemplateId('blank');
    setShowAddAgent(false);
    openAgent(newAgent);
  };

  const openAgent = (agent) => {
    setActiveView('dashboard');
    setSelectedAgent(agent);
    setActiveTab('workflow');
    setOpenMenuId(null);
  };

  const goToDashboard = () => {
    setActiveView('dashboard');
    setSelectedAgent(null);
    setOpenMenuId(null);
  };

  const goToRuns = () => {
    setActiveView('runs');
    setSelectedAgent(null);
    setOpenMenuId(null);
  };

  const goToApprovals = () => {
    setActiveView('approvals');
    setSelectedAgent(null);
    setOpenMenuId(null);
  };

  const goToQueryInbox = () => {
    setActiveView('queryInbox');
    setSelectedAgent(null);
    setOpenMenuId(null);
  };

  const goToSettings = () => {
    setActiveView('settings');
    setSelectedAgent(null);
    setOpenMenuId(null);
  };

  const goToCalendar = () => {
    setActiveView('calendar');
    setSelectedAgent(null);
    setOpenMenuId(null);
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('gra-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const toggleAgentStatus = (agent) => {
    const updatedStatus =
      agent.status === 'running'
        ? 'paused'
        : 'running';

    const updatedAgents = agents.map((item) =>
      item.id === agent.id
        ? {
            ...item,
            status: updatedStatus,
          }
        : item
    );

    saveAgents(updatedAgents);

    if (selectedAgent?.id === agent.id) {
      setSelectedAgent({
        ...selectedAgent,
        status: updatedStatus,
      });
    }

    setOpenMenuId(null);
  };

  const renameAgent = (agent) => {
    const newName = window.prompt(
      'Rename agent',
      agent.name
    );

    if (!newName || !newName.trim()) return;

    const cleanName = newName.trim();

    const updatedAgents = agents.map((item) =>
      item.id === agent.id
        ? {
            ...item,
            name: cleanName,
          }
        : item
    );

    saveAgents(updatedAgents);

    if (selectedAgent?.id === agent.id) {
      setSelectedAgent({
        ...selectedAgent,
        name: cleanName,
      });
    }

    setOpenMenuId(null);
  };

  const deleteAgent = (agent) => {
    const confirmed = window.confirm(
      `Delete "${agent.name}"?`
    );

    if (!confirmed) return;

    const updatedAgents = agents.filter(
      (item) => item.id !== agent.id
    );

    saveAgents(updatedAgents);

    if (selectedAgent?.id === agent.id) {
      setSelectedAgent(null);
    }

    setOpenMenuId(null);
  };

  return (
    <main
      className={`workbench ${
        sidebarCollapsed
          ? 'sidebarCollapsed'
          : ''
      } ${theme === 'light' ? 'lightTheme' : 'darkTheme'}`}
      data-theme={theme}
    >
      <aside className="sidebar">
        <button
          className="sidebarToggle"
          onClick={toggleSidebar}
          aria-label={
            sidebarCollapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
          title={
            sidebarCollapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
        >
          <ChevronIcon direction={sidebarCollapsed ? 'right' : 'left'} />
        </button>

        <div className="brand" />

        <nav className="nav">
          <button
            className={`navItem navItemArchitect ${showSidebarArchitect ? 'active' : ''}`}
            onClick={() => setShowSidebarArchitect((current) => !current)}
            title={sidebarCollapsed ? 'GRA AI Architect' : undefined}
          >
            <span className="navIcon navIconArchitectLogo">
              <img src="/gra-ai-logo.png" alt="GRA AI Architect" className="sidebarAiLogo" />
            </span>
            <span className="sidebarNavLabel">
              GRA AI Architect
            </span>
          </button>

          <button
            className={`navItem ${
              activeView === 'dashboard' &&
              !selectedAgent
                ? 'active'
                : ''
            }`}
            onClick={goToDashboard}
            title={
              sidebarCollapsed
                ? 'Dashboard'
                : undefined
            }
          >
            <span className="navIcon">
              <AgentsIcon />
            </span>
            <span className="sidebarNavLabel">
              Agents
            </span>
          </button>

          <button
            className={`navItem ${
              activeView === 'queryInbox'
                ? 'active'
                : ''
            }`}
            onClick={goToQueryInbox}
            title={
              sidebarCollapsed
                ? 'Query Inbox'
                : undefined
            }
          >
            <span className="navIcon">
              <InboxIcon />
            </span>
            <span className="sidebarNavLabel">
              Query Inbox
            </span>
            {queryStats.unread > 0 && (
              <span className="navBadge">
                {queryStats.unread}
              </span>
            )}
          </button>

          <button
            className={`navItem ${
              activeView === 'runs'
                ? 'active'
                : ''
            }`}
            onClick={goToRuns}
            title={
              sidebarCollapsed
                ? 'Runs'
                : undefined
            }
          >
            <span className="navIcon">
              <RunsIcon />
            </span>
            <span className="sidebarNavLabel">
              Runs
            </span>
          </button>

          <button
            className={`navItem ${
              activeView === 'approvals'
                ? 'active'
                : ''
            }`}
            onClick={goToApprovals}
            title={
              sidebarCollapsed
                ? 'Approvals'
                : undefined
            }
          >
            <span className="navIcon">
              <ApprovalsIcon />
            </span>
            <span className="sidebarNavLabel">
              Approvals
            </span>
          </button>

          <button
            className={`navItem ${
              activeView === 'settings'
                ? 'active'
                : ''
            }`}
            onClick={goToSettings}
            title={
              sidebarCollapsed
                ? 'Settings'
                : undefined
            }
          >
            <span className="navIcon">
              <SettingsIcon />
            </span>
            <span className="sidebarNavLabel">
              Settings
            </span>
          </button>

          <button
            className={`navItem ${
              activeView === 'calendar'
                ? 'active'
                : ''
            }`}
            onClick={goToCalendar}
            title={
              sidebarCollapsed
                ? 'Calendar'
                : undefined
            }
          >
            <span className="navIcon">
              <CalendarIcon />
            </span>
            <span className="sidebarNavLabel">
              Calendar
            </span>
          </button>
        </nav>

        <div className="sidebarBottom">
          <button
            className="themeToggleButton"
            onClick={toggleTheme}
            title={
              theme === 'dark'
                ? 'Switch to Light Mode'
                : 'Switch to Dark Mode'
            }
          >
            <span className="themeToggleIcon">
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </span>

            <span className="sidebarNavLabel">
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>

          <button
            className="siteInfoButton"
            onClick={() =>
              setShowSiteInfo(true)
            }
            title={
              sidebarCollapsed
                ? 'Site Info'
                : undefined
            }
          >
            <span className="siteInfoIcon">
              <InfoIcon />
            </span>

            <span className="sidebarNavLabel">
              Site Info
            </span>
          </button>
        </div>
      </aside>

      <section
        className="workspace"
        onClick={() => {
          if (openMenuId) {
            setOpenMenuId(null);
          }
        }}
      >
        {activeView === 'queryInbox' ? (
          <QueryInbox />
        ) : activeView === 'settings' ? (
          <SettingsView />
        ) : activeView === 'runs' ? (
          <RunsView />
        ) : activeView === 'approvals' ? (
          <ApprovalsView />
        ) : activeView === 'calendar' ? (
          <CalendarView />
        ) : !selectedAgent ? (
          <>
            <div className="workspaceTopbar">
              <div className="workspaceHeading">
                <h1>Agents</h1>

                <span>
                  {agents.length}{' '}
                  {agents.length === 1
                    ? 'agent'
                    : 'agents'}
                </span>
              </div>

              <button
                className="workspaceAddAgent"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddAgent(true);
                }}
              >
                + Add Agent
              </button>
            </div>

            {agents.length === 0 ? (
              <div className="emptyDashboard">
                <img
                  src="/gra-agent-logo.png"
                  alt="AI & Automation"
                  className="emptyDashboardLogo"
                />

                <h2>No agents added yet</h2>

                <p>
                  Add your first agent to start
                  building workflows and actions.
                </p>

                <button
                  onClick={() =>
                    setShowAddAgent(true)
                  }
                >
                  + Add Agent
                </button>
              </div>
            ) : (
              <div className="agentGrid">
                {agents.map((agent) => (
                  <article
                    className="agentPanel clickable"
                    key={agent.id}
                    onClick={() =>
                      openAgent(agent)
                    }
                  >
                    <div className="panelHeader">
                      <div>
                        <strong>
                          {agent.name}
                        </strong>

                        <span
                          className={`statusPill ${
                            agent.status === 'running'
                              ? 'running'
                              : 'paused'
                          }`}
                        >
                          <i />

                          {agent.status === 'running'
                            ? 'Running'
                            : 'Paused'}
                        </span>
                      </div>

                      <div className="agentMenuWrapper">
                        <button
                          className="panelMenu"
                          aria-label="Agent menu"
                          onClick={(e) => {
                            e.stopPropagation();

                            setOpenMenuId(
                              openMenuId === agent.id
                                ? null
                                : agent.id
                            );
                          }}
                        >
                          •••
                        </button>

                        {openMenuId === agent.id && (
                          <div
                            className="agentMenu"
                            onClick={(e) =>
                              e.stopPropagation()
                            }
                          >
                            <button
                              onClick={() =>
                                toggleAgentStatus(agent)
                              }
                            >
                              {agent.status === 'running'
                                ? 'Pause Agent'
                                : 'Start Agent'}
                            </button>

                            <button
                              onClick={() =>
                                renameAgent(agent)
                              }
                            >
                              Rename
                            </button>

                            <button
                              className="deleteMenuItem"
                              onClick={() =>
                                deleteAgent(agent)
                              }
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="panelBody">
                      {(() => {
                        const template = agentTemplates.find(
                          (item) => item.id === agent.templateId
                        );

                        if (!template) {
                          return (
                            <img
                              src="/gra-agent-logo.png"
                              alt="AI & Automation"
                              className="agentLogo"
                            />
                          );
                        }

                        return (
                          <div
                            className="agentTemplateSummary"
                            style={{ '--template-accent': template.accent }}
                          >
                            <p>{template.description}</p>
                            <div className="agentTemplateTags">
                              {template.tags.slice(0, 4).map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="panelFooter">
                      <span>
                        {agent.category || 'Agent workspace'}
                      </span>

                      <span className="openAgentText">
                        Open Agent →
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="agentWorkspace">
            <div className="agentWorkspaceHeader">
              <div className="agentIdentity">
                <img
                  src="/gra-agent-logo.png"
                  alt="AI & Automation"
                  className="agentSmallLogo"
                />

                <div>
                  <strong>
                    {selectedAgent.name}
                  </strong>

                  <span
                    className={`statusPill ${
                      selectedAgent.status === 'running'
                        ? 'running'
                        : 'paused'
                    }`}
                  >
                    <i />

                    {selectedAgent.status === 'running'
                      ? 'Running'
                      : 'Paused'}
                  </span>
                </div>
              </div>

              <button
                className="backButton"
                onClick={goToDashboard}
              >
                ← Dashboard
              </button>
            </div>

            <div className="agentTabs">
              <button
                className={
                  activeTab === 'workflow'
                    ? 'activeTab'
                    : ''
                }
                onClick={() =>
                  setActiveTab('workflow')
                }
              >
                Workflow
              </button>

              <button
                className={
                  activeTab === 'sources'
                    ? 'activeTab'
                    : ''
                }
                onClick={() =>
                  setActiveTab('sources')
                }
              >
                Sources
              </button>
            </div>

            <div className="agentWorkspaceBody">
              {activeTab === 'workflow' ? (
                <WorkflowBuilder
                  agentId={selectedAgent.id}
                  agentName={selectedAgent.name}
                  onOpenSources={() =>
                    setActiveTab('sources')
                  }
                />
              ) : (
                <SourcesView
                  agentId={selectedAgent.id}
                  agentName={selectedAgent.name}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {showAddAgent && (
        <div
          className="modalOverlay"
          onClick={() =>
            setShowAddAgent(false)
          }
        >
          <div
            className="addAgentModal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <button
              className="modalClose"
              onClick={() =>
                setShowAddAgent(false)
              }
            >
              ×
            </button>

            <h2>Add Agent</h2>

            <label>Start From a Template</label>

            <div className="templatePicker" role="radiogroup" aria-label="Agent templates">
              <button
                type="button"
                role="radio"
                aria-checked={selectedTemplateId === 'blank'}
                className={`templateOption ${selectedTemplateId === 'blank' ? 'selected' : ''}`}
                onClick={() => setSelectedTemplateId('blank')}
                style={{ '--template-accent': 'var(--text-muted)' }}
              >
                <span className="templateOptionIcon">+</span>
                <span className="templateOptionText">
                  <strong>Blank workflow</strong>
                  <span>Start from an empty canvas</span>
                </span>
              </button>

              {agentTemplates.map((template) => (
                <button
                  type="button"
                  role="radio"
                  key={template.id}
                  aria-checked={selectedTemplateId === template.id}
                  className={`templateOption ${selectedTemplateId === template.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTemplateId(template.id)}
                  style={{ '--template-accent': template.accent }}
                >
                  <span className="templateOptionIcon">{template.icon}</span>
                  <span className="templateOptionText">
                    <strong>{template.name}</strong>
                    <span>{template.short} · {template.category}</span>
                  </span>
                </button>
              ))}
            </div>

            <label>Agent Name</label>

            <input
              value={agentName}
              onChange={(e) =>
                setAgentName(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  addAgent();
                }
              }}
              placeholder={
                agentTemplates.find((item) => item.id === selectedTemplateId)?.name ||
                'Example: GST Reconciliation Agent'
              }
              autoFocus
            />

            <label>Status</label>

            <select
              value={agentStatus}
              onChange={(e) =>
                setAgentStatus(
                  e.target.value
                )
              }
            >
              <option value="paused">
                Paused
              </option>

              <option value="running">
                Running
              </option>
            </select>

            <button
              className="createAgentButton"
              onClick={addAgent}
            >
              Create Agent
            </button>
          </div>
        </div>
      )}

      {showSiteInfo && (
        <div
          className="modalOverlay"
          onClick={() =>
            setShowSiteInfo(false)
          }
        >
          <div
            className="siteInfoModal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <button
              className="modalClose"
              onClick={() =>
                setShowSiteInfo(false)
              }
            >
              ×
            </button>

            <img
              src="/gra-agent-logo.png"
              alt="AI & Automation"
              className="siteInfoLogo"
            />

            <h2>
              GRA AGENT WORKBENCH
            </h2>

            <p>Created by</p>

            <h3>Gaurav Sharma</h3>

            <a
              href="https://www.linkedin.com/company/ai-for-cas-startups/"
              target="_blank"
              rel="noopener noreferrer"
            >
              AI & Automation ↗
            </a>
          </div>
        </div>
      )}

      <GauravChatDrawer
        isOpen={showSidebarArchitect}
        onClose={() => setShowSidebarArchitect(false)}
        agentId={selectedAgent?.id || 'global'}
        agentName={selectedAgent?.name || 'GRA Workspace'}
      />
    </main>
  );
}
