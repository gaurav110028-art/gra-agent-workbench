'use client';

import { useEffect, useState } from 'react';
import WorkflowBuilder from './WorkflowBuilder';
import RunsView from './RunsView';
import ApprovalsView from './ApprovalsView';
import SourcesView from './SourcesView';

export default function Home() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);

  const [activeView, setActiveView] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('workflow');

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showSiteInfo, setShowSiteInfo] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [agentName, setAgentName] = useState('');
  const [agentStatus, setAgentStatus] = useState('paused');

  useEffect(() => {
    const savedAgents = localStorage.getItem('gra-agents');

    if (savedAgents) {
      try {
        setAgents(JSON.parse(savedAgents));
      } catch {
        localStorage.removeItem('gra-agents');
      }
    }

    const savedSidebarState =
      localStorage.getItem('gra-sidebar-collapsed');

    if (savedSidebarState === 'true') {
      setSidebarCollapsed(true);
    }
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
    if (!agentName.trim()) return;

    const newAgent = {
      id: Date.now(),
      name: agentName.trim(),
      status: agentStatus,
    };

    saveAgents([...agents, newAgent]);

    setAgentName('');
    setAgentStatus('paused');
    setShowAddAgent(false);
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
      }`}
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
          {sidebarCollapsed ? '›' : '‹'}
        </button>

        <div className="brand" />

        <nav className="nav">
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
            <span className="sidebarNavLabel">
              Dashboard
            </span>
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
            <span className="sidebarNavLabel">
              Approvals
            </span>
          </button>

          <button
            className="navItem"
            title={
              sidebarCollapsed
                ? 'Settings'
                : undefined
            }
          >
            <span className="sidebarNavLabel">
              Settings
            </span>
          </button>
        </nav>

        <div className="sidebarBottom">
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
              ⓘ
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
        {activeView === 'runs' ? (
          <RunsView />
        ) : activeView === 'approvals' ? (
          <ApprovalsView />
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
                      <img
                        src="/gra-agent-logo.png"
                        alt="AI & Automation"
                        className="agentLogo"
                      />
                    </div>

                    <div className="panelFooter">
                      <span>
                        Agent workspace
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

            <label>Agent Name</label>

            <input
              value={agentName}
              onChange={(e) =>
                setAgentName(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addAgent();
                }
              }}
              placeholder="Example: GST Reconciliation Agent"
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
    </main>
  );
}
