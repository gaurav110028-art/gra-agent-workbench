'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activeTab, setActiveTab] = useState('workflow');
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showSiteInfo, setShowSiteInfo] = useState(false);

  const [agentName, setAgentName] = useState('');
  const [agentStatus, setAgentStatus] = useState('paused');

  useEffect(() => {
    const savedAgents = localStorage.getItem('gra-agents');

    if (savedAgents) {
      setAgents(JSON.parse(savedAgents));
    }
  }, []);

  const saveAgents = (updatedAgents) => {
    setAgents(updatedAgents);
    localStorage.setItem('gra-agents', JSON.stringify(updatedAgents));
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
    setSelectedAgent(agent);
    setActiveTab('workflow');
  };

  return (
    <main className="workbench">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandTitle">GRA AGENT WORKBENCH</div>
        </div>

        <nav className="nav">
          <button
            className={`navItem ${!selectedAgent ? 'active' : ''}`}
            onClick={() => setSelectedAgent(null)}
          >
            Dashboard
          </button>

          <button
            className="navItem addAgentNav"
            onClick={() => setShowAddAgent(true)}
          >
            + Add Agent
          </button>

          <button className="navItem">Runs</button>
          <button className="navItem">Approvals</button>
          <button className="navItem">Settings</button>
        </nav>

        <div className="sidebarBottom">
          <button
            className="siteInfoButton"
            onClick={() => setShowSiteInfo(true)}
          >
            ⓘ Site Info
          </button>
        </div>
      </aside>

      <section className="workspace">
        {!selectedAgent ? (
          agents.length === 0 ? (
            <div className="emptyDashboard">
              <img
                src="/ai-automation-logo.png"
                alt=""
                className="emptyDashboardLogo"
              />

              <h2>No agents added yet</h2>

              <p>
                Add your first agent to start building workflows and actions.
              </p>

              <button onClick={() => setShowAddAgent(true)}>
                + Add Agent
              </button>
            </div>
          ) : (
            <div className="agentGrid">
              {agents.map((agent) => (
                <article
                  className="agentPanel clickable"
                  key={agent.id}
                  onClick={() => openAgent(agent)}
                >
                  <div className="panelHeader">
                    <div>
                      <strong>{agent.name}</strong>

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

                    <button
                      className="panelMenu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      •••
                    </button>
                  </div>

                  <div className="panelBody">
                    <img
                      src="/ai-automation-logo.png"
                      alt="AI & Automation"
                      className="agentLogo"
                    />
                  </div>

                  <div className="panelFooter">
                    <span>Agent workspace</span>
                    <span className="openAgentText">
                      Open Agent →
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
          <div className="agentWorkspace">
            <div className="agentWorkspaceHeader">
              <div className="agentIdentity">
                <img
                  src="/ai-automation-logo.png"
                  alt=""
                  className="agentSmallLogo"
                />

                <div>
                  <strong>{selectedAgent.name}</strong>

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
                onClick={() => setSelectedAgent(null)}
              >
                ← Dashboard
              </button>
            </div>

            <div className="agentTabs">
              <button
                className={
                  activeTab === 'workflow' ? 'activeTab' : ''
                }
                onClick={() => setActiveTab('workflow')}
              >
                Workflow
              </button>

              <button
                className={
                  activeTab === 'code' ? 'activeTab' : ''
                }
                onClick={() => setActiveTab('code')}
              >
                Code
              </button>
            </div>

            <div className="agentWorkspaceBody">
              {activeTab === 'workflow' ? (
                <div className="emptyState">
                  <h2>Workflow</h2>
                  <p>
                    Build and manage this agent&apos;s workflow here.
                  </p>
                </div>
              ) : (
                <div className="emptyState">
                  <h2>Code</h2>
                  <p>
                    Code and configuration for this agent will live
                    here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {showAddAgent && (
        <div
          className="modalOverlay"
          onClick={() => setShowAddAgent(false)}
        >
          <div
            className="addAgentModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modalClose"
              onClick={() => setShowAddAgent(false)}
            >
              ×
            </button>

            <h2>Add Agent</h2>

            <label>Agent Name</label>

            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Example: GST Reconciliation Agent"
              autoFocus
            />

            <label>Status</label>

            <select
              value={agentStatus}
              onChange={(e) => setAgentStatus(e.target.value)}
            >
              <option value="paused">Paused</option>
              <option value="running">Running</option>
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
          onClick={() => setShowSiteInfo(false)}
        >
          <div
            className="siteInfoModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modalClose"
              onClick={() => setShowSiteInfo(false)}
            >
              ×
            </button>

            <img
              src="/ai-automation-logo.png"
              alt="AI & Automation"
              className="siteInfoLogo"
            />

            <h2>GRA AGENT WORKBENCH</h2>

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
