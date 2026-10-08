'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  subscribeToTeam,
} from './queryStore';
import {
  WebhookIcon,
  UsersIcon,
  SheetIcon,
  BellIcon,
  InfoIcon,
} from './NavIcons';

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */

const ROLES = ['Staff', 'Senior', 'Partner'];

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */

export default function SettingsView() {
  const [activeSection, setActiveSection] = useState('webhook');

  return (
    <div className="settingsContainer">
      <div className="settingsHeader">
        <h1>Settings</h1>
        <span className="settingsSubtitle">
          Configure integrations, team, and preferences
        </span>
      </div>

      <div className="settingsLayout">
        {/* Settings Nav */}
        <div className="settingsNav">
          {[
            ['webhook', <WebhookIcon key="i" />, 'WhatsApp Webhook'],
            ['team', <UsersIcon key="i" />, 'Team Members'],
            ['sheets', <SheetIcon key="i" />, 'Google Sheets'],
            ['notifications', <BellIcon key="i" />, 'Notifications'],
            ['about', <InfoIcon key="i" />, 'About'],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={`settingsNavItem ${activeSection === id ? 'active' : ''}`}
              onClick={() => setActiveSection(id)}
            >
              <span className="settingsNavIcon">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Settings Content */}
        <div className="settingsContent">
          {activeSection === 'webhook' && <WebhookSettings />}
          {activeSection === 'team' && <TeamSettings />}
          {activeSection === 'sheets' && <SheetsSettings />}
          {activeSection === 'notifications' && <NotificationSettings />}
          {activeSection === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   WEBHOOK SETTINGS
--------------------------------------------------------- */

function WebhookSettings() {
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhook/whatsapp`
      : '/api/webhook/whatsapp';

  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setTestResult({ ok: true, message: 'Webhook URL copied to clipboard!' });
    setTimeout(() => setTestResult(null), 3000);
  };

  const sendTestWebhook = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: 'Test User',
          senderNumber: '+91-99999-00000',
          message: 'This is a test message sent from the Settings page to verify the webhook is working correctly.',
          source: 'personal',
          groupName: '',
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({
          ok: true,
          message: 'Test message sent successfully! Check the Query Inbox.',
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || 'Webhook test failed.',
        });
      }
    } catch (error) {
      setTestResult({
        ok: false,
        message: error.message || 'Could not reach the webhook.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settingsSection">
      <h2>WhatsApp Webhook</h2>
      <p className="settingsSectionDesc">
        This is the URL that the WhatsApp API provider (360Biz) needs to send messages to.
        When a client sends a WhatsApp message, the API will call this webhook, and the
        message will appear in your Query Inbox automatically.
      </p>

      <div className="settingsCard">
        <div className="settingsCardTitle">Webhook URL</div>
        <div className="settingsWebhookUrl">
          <code>{webhookUrl}</code>
          <button className="settingsCopyBtn" onClick={copyUrl}>
            Copy
          </button>
        </div>

        <div className="settingsCardHint">
          Share this URL with the 360Biz technical team. They will configure
          their system to POST messages to this endpoint.
        </div>
      </div>

      <div className="settingsCard">
        <div className="settingsCardTitle">Test Webhook</div>
        <p className="settingsCardDesc">
          Send a test message to verify the webhook is working.
        </p>
        <button
          className="settingsTestBtn"
          onClick={sendTestWebhook}
          disabled={testing}
        >
          {testing ? 'Sending...' : 'Send Test Message'}
        </button>

        {testResult && (
          <div
            className={`settingsTestResult ${testResult.ok ? 'success' : 'error'}`}
          >
            {testResult.message}
          </div>
        )}
      </div>

      <div className="settingsCard">
        <div className="settingsCardTitle">Payload Format</div>
        <p className="settingsCardDesc">
          The webhook expects a JSON POST request with this structure:
        </p>
        <pre className="settingsCodeBlock">
{`{
  "senderName": "Client Name",
  "senderNumber": "+91-XXXXX-XXXXX",
  "message": "Message text",
  "source": "personal" or "group",
  "groupName": "Group Name (if group)",
  "timestamp": "2026-09-21T10:30:00Z"
}`}
        </pre>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   TEAM SETTINGS
--------------------------------------------------------- */

function TeamSettings() {
  const [team, setTeam] = useState([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Staff');
  const [phone, setPhone] = useState('');

  const refreshTeam = useCallback(() => {
    setTeam(getTeamMembers());
  }, []);

  useEffect(() => {
    refreshTeam();
    const unsub = subscribeToTeam(refreshTeam);
    return () => unsub();
  }, [refreshTeam]);

  const handleAdd = () => {
    if (!name.trim()) return;
    addTeamMember({ name: name.trim(), role, phone: phone.trim() });
    setName('');
    setPhone('');
    setRole('Staff');
    refreshTeam();
  };

  const handleRemove = (id) => {
    if (window.confirm('Remove this team member?')) {
      removeTeamMember(id);
      refreshTeam();
    }
  };

  return (
    <div className="settingsSection">
      <h2>Team Members</h2>
      <p className="settingsSectionDesc">
        Add your team members here. They will appear in the Query Inbox when
        you assign or escalate queries.
      </p>

      <div className="settingsCard">
        <div className="settingsCardTitle">Add Team Member</div>

        <div className="settingsFormRow">
          <div className="settingsField">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
          </div>

          <div className="settingsField">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="settingsField">
            <label>Phone (optional)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91-XXXXX-XXXXX"
            />
          </div>

          <button className="settingsAddBtn" onClick={handleAdd}>
            + Add
          </button>
        </div>
      </div>

      <div className="settingsCard">
        <div className="settingsCardTitle">
          Current Team ({team.length})
        </div>

        {team.length === 0 ? (
          <div className="settingsEmptyTeam">
            No team members added yet. Add your first team member above.
          </div>
        ) : (
          <div className="settingsTeamList">
            {team.map((member) => (
              <div key={member.id} className="settingsTeamRow">
                <div className="settingsTeamAvatar">
                  {member.name[0].toUpperCase()}
                </div>

                <div className="settingsTeamInfo">
                  <strong>{member.name}</strong>
                  <span>{member.role}</span>
                  {member.phone && <small>{member.phone}</small>}
                </div>

                <button
                  className="settingsTeamRemove"
                  onClick={() => handleRemove(member.id)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   GOOGLE SHEETS SETTINGS
--------------------------------------------------------- */

function SheetsSettings() {
  return (
    <div className="settingsSection">
      <h2>Google Sheets Integration</h2>
      <p className="settingsSectionDesc">
        Connect to Google Sheets to automatically log all queries for review and audit.
      </p>

      <div className="settingsCard">
        <div className="settingsCardTitle">Status</div>
        <div className="settingsComingSoon">
          <span className="settingsComingIcon">🚧</span>
          <div>
            <strong>Coming Soon</strong>
            <p>
              Google Sheets integration will be available once the WhatsApp webhook
              is connected. This will auto-log every query to a shared sheet that
              your team can check at fixed times.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   NOTIFICATION SETTINGS
--------------------------------------------------------- */

function NotificationSettings() {
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      new Notification('GRA Agent Workbench', {
        body: 'Desktop notifications are now enabled. You will be notified when new queries arrive.',
        icon: '/gra-agent-logo.png',
      });
    }
  };

  return (
    <div className="settingsSection">
      <h2>Notifications</h2>
      <p className="settingsSectionDesc">
        Get notified when new WhatsApp queries arrive.
      </p>

      <div className="settingsCard">
        <div className="settingsCardTitle">Desktop Notifications</div>

        <div className="settingsNotifRow">
          <div>
            <strong>Browser Notifications</strong>
            <p>
              {permission === 'granted'
                ? 'Notifications are enabled. You will receive alerts for new queries.'
                : permission === 'denied'
                ? 'Notifications are blocked. Please enable them in your browser settings.'
                : 'Enable desktop notifications to get alerts when new queries arrive.'}
            </p>
          </div>

          {permission !== 'granted' && permission !== 'denied' && (
            <button className="settingsTestBtn" onClick={requestPermission}>
              Enable Notifications
            </button>
          )}

          {permission === 'granted' && (
            <span className="settingsNotifEnabled">✓ Enabled</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   ABOUT SECTION
--------------------------------------------------------- */

function AboutSection() {
  return (
    <div className="settingsSection">
      <h2>About</h2>

      <div className="settingsCard settingsAboutCard">
        <img
          src="/gra-agent-logo.png"
          alt="GRA Agent Workbench"
          className="settingsAboutLogo"
        />

        <h3>GRA Agent Workbench</h3>
        <p>Version 2.0</p>

        <div className="settingsAboutDivider" />

        <p className="settingsAboutCredit">Created by</p>
        <h4>Gaurav Sharma</h4>
        <p>AI and Automation</p>

        <a
          href="https://www.linkedin.com/company/ai-for-cas-startups/"
          target="_blank"
          rel="noopener noreferrer"
          className="settingsAboutLink"
        >
          AI and Automation ↗
        </a>
      </div>
    </div>
  );
}
