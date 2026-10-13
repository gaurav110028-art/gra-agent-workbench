'use client';

import { useState, useEffect, useRef } from 'react';
import {
  GAURAV_SUGGESTIONS,
  getGauravHistory,
  saveGauravHistory,
  clearGauravHistory,
} from './gauravStore';

function renderBoldText(text) {
  const parts = String(text || '').split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function formatMessageContent(content) {
  if (!content) return null;

  // Remove em-dashes and replace with clean hyphen/colon
  const withoutEmDashes = String(content)
    .replace(/—/g, ' - ')
    .replace(/--/g, ' - ');

  // Split lines and process
  const lines = withoutEmDashes.split('\n');
  const elements = [];

  lines.forEach((rawLine, index) => {
    let line = rawLine.trim();
    if (!line) return;

    // Strip any hashtags completely
    line = line.replace(/^#{1,6}\s*/, '');

    const isHeading =
      rawLine.trim().startsWith('#') ||
      (line.endsWith(':') && line.length < 55 && !line.startsWith('*') && !/^\d+\./.test(line));

    if (isHeading) {
      elements.push(
        <h4 key={index} className="gauravMsgHeading">
          {line.replace(/\*\*/g, '')}
        </h4>
      );
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      elements.push(
        <div key={index} className="gauravMsgBulletRow">
          <span className="gauravBulletDot">•</span>
          <span className="gauravBulletText">{renderBoldText(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s*/.test(line)) {
      const match = line.match(/^(\d+)\.\s*(.*)/);
      elements.push(
        <div key={index} className="gauravMsgNumberedRow">
          <span className="gauravNumBadge">{match ? match[1] : '•'}</span>
          <span className="gauravNumText">{renderBoldText(match ? match[2] : line)}</span>
        </div>
      );
    } else {
      elements.push(
        <p key={index} className="gauravMsgParagraph">
          {renderBoldText(line)}
        </p>
      );
    }
  });

  return elements;
}

export default function GauravChatDrawer({
  isOpen,
  onClose,
  agentId,
  agentName = 'Agent',
  currentNodes = [],
  currentEdges = [],
  onApplyBlueprint,
  onExecuteControlAction,
  runStatus = 'idle',
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [engineMode, setEngineMode] = useState('dev-architect-engine');
  const [providerNotice, setProviderNotice] = useState('');
  const [appliedMsgIds, setAppliedMsgIds] = useState(new Set());
  const [expandedConfigId, setExpandedConfigId] = useState(null);
  const [executedActionIds, setExecutedActionIds] = useState(new Set());
  const [confirmingActionId, setConfirmingActionId] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('auto');
  const [activeModelName, setActiveModelName] = useState('gra-architect-rule-v2');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (agentId) {
      const history = getGauravHistory(agentId, agentName);
      setMessages(history);
    }
  }, [agentId, agentName]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, messages]);

  const handleSend = async (promptToSend) => {
    const text = (promptToSend || input).trim();
    if (!text || loading) return;

    setError('');
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toISOString(),
      content: text,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    saveGauravHistory(agentId, nextMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/architect/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          agentId,
          agentName,
          currentNodes,
          currentEdges,
          preferredProvider: selectedProvider !== 'auto' ? selectedProvider : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Request failed with HTTP ${response.status}`);
      }

      if (data.mode) setEngineMode(data.mode);
      if (data.notice) setProviderNotice(data.notice);
      if (data.model) setActiveModelName(data.model);

      const botMsg = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        content: data.reply || 'Workflow architecture mapped successfully.',
        pipelinePreview: data.pipelinePreview || null,
        blueprint: data.blueprint || null,
        actionIntent: data.actionIntent || null,
        provider: data.provider || 'GRA AI Architect',
        model: data.model || null,
        fallbackUsed: data.fallbackUsed || false,
      };

      const finalMessages = [...nextMessages, botMsg];
      setMessages(finalMessages);
      saveGauravHistory(agentId, finalMessages);
    } catch (err) {
      console.error('GRA AI Architect chat request failed:', err);
      setError(err?.message || 'Failed to reach GRA AI Architect service.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (msgId, blueprint, mode = 'replace') => {
    if (!blueprint || !onApplyBlueprint) return;
    onApplyBlueprint(blueprint, mode);
    setAppliedMsgIds((prev) => new Set([...prev, msgId]));
  };

  const toggleConfigInspector = (msgId) => {
    setExpandedConfigId((current) => (current === msgId ? null : msgId));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTriggerControlAction = (msgId, actionIntent) => {
    if (!actionIntent || !onExecuteControlAction) return;

    if (actionIntent.requireConfirmation && confirmingActionId !== msgId) {
      setConfirmingActionId(msgId);
      return;
    }

    setConfirmingActionId(null);
    setExecutedActionIds((prev) => new Set([...prev, msgId]));
    onExecuteControlAction(actionIntent);
  };

  const handleClear = () => {
    if (window.confirm('Clear conversation history with Gaurav for this agent?')) {
      const initial = clearGauravHistory(agentId, agentName);
      setMessages(initial);
      setAppliedMsgIds(new Set());
      setExpandedConfigId(null);
      setExecutedActionIds(new Set());
      setConfirmingActionId(null);
      setError('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="gauravDrawerOverlay" onClick={onClose}>
      <aside
        className="gauravDrawerContainer"
        onClick={(e) => e.stopPropagation()}
        aria-label="GRA AI Architect"
      >
        {/* Header */}
        <div className="gauravDrawerHeader">
          <div className="gauravDrawerBrand">
            <div className="gauravAvatar">
              <img
                src="/gra-ai-logo.png"
                alt="GRA AI Architect"
                className="gauravAvatarImg"
              />
              <span className="gauravPulseDot" />
            </div>
            <div className="gauravBrandText">
              <div className="gauravTitleRow">
                <h3>GRA AI Architect</h3>
                <span
                  className={`gauravModeBadge ${
                    engineMode === 'live' ? 'isLive' : 'isDev'
                  }`}
                  title={providerNotice || 'Development Architect Engine'}
                >
                  {engineMode === 'live' ? '● Live AI' : '● Dev Engine'}
                </span>
              </div>
              <div className="gauravModelSelectRow">
                <span className="gauravTagline">Your AI Automation Architect</span>
                <select
                  className="gauravModelDropdown"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  title="Select AI Model Provider"
                >
                  <option value="auto">Auto Router (Smart Fallback)</option>
                  <option value="groq">Groq (Llama 3.3 70B - Ultra Fast)</option>
                  <option value="openrouter">OpenRouter (Free 70B Models)</option>
                  <option value="gemini">Google Gemini (3.8 Flash)</option>
                  <option value="openai">OpenAI (GPT-4o mini)</option>
                  <option value="anthropic">Anthropic (Claude Haiku 4.5)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="gauravHeaderActions">
            <button
              type="button"
              className="gauravIconBtn"
              onClick={handleClear}
              title="Reset conversation"
            >
              🗑
            </button>
            <button
              type="button"
              className="gauravIconBtn gauravCloseBtn"
              onClick={onClose}
              title="Close drawer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        {providerNotice && (
          <div className="gauravNoticeBanner">
            <span>ℹ {providerNotice}</span>
          </div>
        )}

        {/* Suggestion Chips */}
        <div className="gauravSuggestionsSection">
          <div className="gauravSuggestionsLabel">Recommended Automations:</div>
          <div className="gauravSuggestionsScroll">
            {GAURAV_SUGGESTIONS.map((item) => (
              <button
                type="button"
                key={item.id}
                className="gauravSuggestionChip"
                onClick={() => handleSend(item.prompt)}
                disabled={loading}
              >
                <span className="gauravChipBadge">{item.badge}</span>
                <span className="gauravChipTitle">{item.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message Stream */}
        <div className="gauravMessagesStream">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`gauravMessageRow ${
                msg.sender === 'user' ? 'isUser' : 'isAssistant'
              }`}
            >
              {msg.sender === 'assistant' && (
                <div className="gauravMsgAvatar">
                  <img
                    src="/gra-ai-logo.png"
                    alt="Gaurav"
                    className="gauravMsgAvatarImg"
                  />
                </div>
              )}

              <div className="gauravMsgBubble">
                <div className="gauravMsgHeader">
                  <strong>
                    {msg.sender === 'user' ? 'You' : 'Gaurav'}
                  </strong>
                  <div className="gauravMsgMetaRight">
                    {msg.sender === 'assistant' && msg.provider && (
                      <span className="gauravMsgModelBadge" title={`Model: ${msg.model || msg.provider}`}>
                        {msg.provider}
                        {msg.fallbackUsed ? ' (fallback)' : ''}
                      </span>
                    )}
                    <small>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                  </div>
                </div>

                <div className="gauravMsgContent">
                  {formatMessageContent(msg.content)}
                </div>

                {/* Phase 2: Interactive Workflow Blueprint Card */}
                {msg.blueprint && Array.isArray(msg.blueprint.nodes) && (
                  <div className="gauravBlueprintCard">
                    <div className="gauravBlueprintHeader">
                      <div className="gauravBlueprintTitle">
                        <span>✨ Visual Workflow Blueprint</span>
                        <small>
                          {msg.blueprint.nodes.length} nodes · {msg.blueprint.edges?.length || 0} connections
                        </small>
                      </div>
                      {appliedMsgIds.has(msg.id) ? (
                        <span className="gauravAppliedBadge">✓ Applied to Canvas</span>
                      ) : (
                        <span className="gauravReadyBadge">● Ready to Apply</span>
                      )}
                    </div>

                    <div className="gauravBlueprintNodesList">
                      {msg.blueprint.nodes.map((node, nIdx) => (
                        <div key={node.id} className="gauravBlueprintNodeItem">
                          <span className="gauravNodeIndex">{nIdx + 1}</span>
                          <span className="gauravNodeIcon">{node.data?.icon || '•'}</span>
                          <div className="gauravNodeMeta">
                            <strong>{node.data?.name}</strong>
                            <small>{node.data?.description || node.data?.nodeType}</small>
                          </div>
                          <span className="gauravNodeGroupTag">{node.data?.group || node.data?.nodeType}</span>
                        </div>
                      ))}
                    </div>

                    <div className="gauravBlueprintActions">
                      <button
                        type="button"
                        className="gauravApplyBtn"
                        onClick={() => handleApply(msg.id, msg.blueprint, 'replace')}
                        title="Load this workflow directly onto canvas"
                      >
                        <span>✨ Apply to Canvas</span>
                      </button>

                      {currentNodes.length > 0 && (
                        <button
                          type="button"
                          className="gauravAppendBtn"
                          onClick={() => handleApply(msg.id, msg.blueprint, 'append')}
                          title="Append to existing workflow nodes"
                        >
                          <span>➕ Append</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="gauravInspectBtn"
                        onClick={() => toggleConfigInspector(msg.id)}
                        title="View node configurations and schemas"
                      >
                        <span>{expandedConfigId === msg.id ? '▲ Hide Config' : '▼ Inspect Config'}</span>
                      </button>
                    </div>

                    {expandedConfigId === msg.id && (
                      <div className="gauravBlueprintDetails">
                        <div className="gauravDetailsHeader">Verified Node Configuration:</div>
                        {msg.blueprint.nodes.map((node) => (
                          <div key={node.id} className="gauravNodeConfigRow">
                            <div className="gauravNodeConfigTitle">
                              <strong>{node.data?.name}</strong> (<code>{node.data?.nodeType}</code>)
                            </div>
                            <pre className="gauravNodeConfigJson">
                              {JSON.stringify(node.data?.config || {}, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Phase 3: Interactive Agent Controller Action Card */}
                {msg.actionIntent && (
                  <div className="gauravControllerCard">
                    <div className="gauravControllerHeader">
                      <div className="gauravControllerTitle">
                        <span>⚡ Agent Controller Command</span>
                        <small>Target: {agentName} · Canvas Nodes: {currentNodes.length}</small>
                      </div>
                      <span className={`gauravActionBadge ${executedActionIds.has(msg.id) ? 'isExecuted' : 'isPending'}`}>
                        {executedActionIds.has(msg.id) ? '✓ Executed' : '● Ready'}
                      </span>
                    </div>

                    <div className="gauravControllerDetails">
                      <div className="gauravActionMetaRow">
                        <span className="gauravActionKey">Action:</span>
                        <strong className="gauravActionVal">{msg.actionIntent.label}</strong>
                      </div>
                      <div className="gauravActionMetaRow">
                        <span className="gauravActionKey">Status:</span>
                        <span className="gauravActionStatusVal">
                          {runStatus === 'running'
                            ? 'Running...'
                            : runStatus === 'waiting'
                            ? 'Waiting for Partner Approval'
                            : runStatus === 'completed'
                            ? 'Completed'
                            : runStatus === 'blocked'
                            ? 'Blocked / Attention Required'
                            : 'Ready to Trigger'}
                        </span>
                      </div>
                    </div>

                    {confirmingActionId === msg.id && (
                      <div className="gauravConfirmNotice">
                        <strong>⚠️ Confirmation Required:</strong>
                        <p>{msg.actionIntent.confirmPrompt || 'Are you sure you want to proceed with this live action?'}</p>
                      </div>
                    )}

                    <div className="gauravControllerActions">
                      <button
                        type="button"
                        className={`gauravTriggerActionBtn ${
                          confirmingActionId === msg.id ? 'isConfirming' : ''
                        }`}
                        onClick={() => handleTriggerControlAction(msg.id, msg.actionIntent)}
                        disabled={loading || (runStatus === 'running' && msg.actionIntent.type !== 'GET_STATUS')}
                      >
                        {confirmingActionId === msg.id ? (
                          <span>⚠️ Click to Confirm & Execute Now</span>
                        ) : executedActionIds.has(msg.id) ? (
                          <span>🔄 Trigger Again ({msg.actionIntent.label})</span>
                        ) : (
                          <span>▶ Execute {msg.actionIntent.label}</span>
                        )}
                      </button>

                      {confirmingActionId === msg.id && (
                        <button
                          type="button"
                          className="gauravCancelConfirmBtn"
                          onClick={() => setConfirmingActionId(null)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="gauravMessageRow isAssistant">
              <div className="gauravMsgAvatar">
                <img
                  src="/gra-ai-logo.png"
                  alt="Gaurav"
                  className="gauravMsgAvatarImg"
                />
              </div>
              <div className="gauravMsgBubble gauravLoadingBubble">
                <span className="gauravThinkingText">Generating visual workflow blueprint</span>
                <span className="gauravThinkingDots">
                  <i>.</i>
                  <i>.</i>
                  <i>.</i>
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="gauravErrorBanner">
              <span>⚠ {error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <div className="gauravInputContainer">
          <div className="gauravInputWrapper">
            <textarea
              ref={inputRef}
              rows={2}
              className="gauravTextarea"
              placeholder="Describe your automation (e.g. 'Create client doc chaser', 'Add WhatsApp alert')..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              type="button"
              className="gauravSendButton"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              title="Send instruction (Enter)"
            >
              {loading ? '…' : '↑'}
            </button>
          </div>
          <div className="gauravInputHelp">
            <span>Press Enter to send, Shift+Enter for new line.</span>
            <span>GRA AI Architect v2.0</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
