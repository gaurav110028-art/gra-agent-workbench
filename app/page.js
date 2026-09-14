'use client';

const agents = [
  { id: 1, name: 'Agent 1', status: 'Ready' },
  { id: 2, name: 'Agent 2', status: 'Ready' },
  { id: 3, name: 'Agent 3', status: 'Ready' },
  { id: 4, name: 'Agent 4', status: 'Ready' },
  { id: 5, name: 'Agent 5', status: 'Ready' },
  { id: 6, name: 'Agent 6', status: 'Ready' },
];

export default function Home() {
  return (
    <main className="workbench">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandTitle">GRA AGENT WORKBENCH</div>
          <div className="brandCredit">Created by Gaurav Sharma</div>
          <div className="brandSub">AI & Automation</div>
        </div>

        <nav className="nav">
          <button className="navItem active">Dashboard</button>
          <button className="navItem">Agents</button>
          <button className="navItem">Runs</button>
          <button className="navItem">Approvals</button>
          <button className="navItem">Settings</button>
        </nav>
      </aside>

      <section className="workspace">
        <div className="agentGrid">
          {agents.map((agent) => (
            <article className="agentPanel" key={agent.id}>
              <div className="panelHeader">
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.status}</span>
                </div>

                <button className="panelMenu">•••</button>
              </div>

              <div className="panelBody">
                <div className="agentNumber">{agent.id}</div>
              </div>

              <div className="panelFooter">
                <span>Workflow not configured</span>
                <button>Run</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
