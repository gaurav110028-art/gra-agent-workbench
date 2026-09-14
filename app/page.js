'use client';

import { useState } from 'react';

const agents = [
  { id: 1, name: 'Agent 1', status: 'Ready' },
  { id: 2, name: 'Agent 2', status: 'Ready' },
  { id: 3, name: 'Agent 3', status: 'Ready' },
  { id: 4, name: 'Agent 4', status: 'Ready' },
  { id: 5, name: 'Agent 5', status: 'Ready' },
  { id: 6, name: 'Agent 6', status: 'Ready' },
];

export default function Home() {
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activeTab, setActiveTab] = useState('workflow');
  const [showSiteInfo, setShowSiteInfo] = useState(false);

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

          <button className="navItem">Agents</button>
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
                    <span>{agent.status}</span>
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
                  <span>Workflow not configured</span>
                  <span className="openAgentText">Open Agent →</span>
                </div>
              </article>
            ))}
          </div>
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
                  <span>{selectedAgent.status}</span>
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
                className={activeTab === 'workflow' ? 'activeTab' : ''}
                onClick={() => setActiveTab('workflow')}
              >
                Workflow
              </button>

              <button
                className={activeTab === 'code' ? 'activeTab' : ''}
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
                    This is where the agent workflow, steps, tools and approvals
                    will be configured.
                  </p>
                </div>
              ) : (
                <div className="emptyState">
                  <h2>Code</h2>
                  <p>
                    This is where the code, configuration and actions behind
                    this agent will live.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

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
