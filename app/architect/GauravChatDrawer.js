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

  // 1. Remove em-dashes and replace with clean hyphen/colon
  const withoutEmDashes = String(content)
    .replace(/—/g, ' - ')
    .replace(/--/g, ' - ');

  // 2. Split lines and process
  const lines = withoutEmDashes.split('\n');
  const elements = [];

  lines.forEach((rawLine, index) => {
    let line = rawLine.trim();
    if (!line) return;

    // 3. Strip any hashtags completely
    line = line.replace(/^#{1,6}\s*/, '');

    // Check if line is a section header (e.g., ends with colon or was a heading)
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
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [engineMode, setEngineMode] = useState('dev-architect-engine');
  const [providerNotice, setProviderNotice] = useState('');

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
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Request failed with HTTP ${response.status}`);
      }

      if (data.mode) setEngineMode(data.mode);
      if (data.notice) setProviderNotice(data.notice);

      const botMsg = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        content: data.reply || 'Workflow architecture mapped successfully.',
        pipelinePreview: data.pipelinePreview || null,
        provider: data.provider || 'GRA AI Architect',
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    if (window.confirm('Clear conversation history with Gaurav for this agent?')) {
      const initial = clearGauravHistory(agentId, agentName);
      setMessages(initial);
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
              <p className="gauravTagline">Your AI Automation Architect</p>
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
                  <small>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </div>

                <div className="gauravMsgContent">
                  {formatMessageContent(msg.content)}
                </div>

                {/* Pipeline Card */}
                {Array.isArray(msg.pipelinePreview) &&
                  msg.pipelinePreview.length > 0 && (
                    <div className="gauravPipelineCard">
                      <div className="gauravPipelineHeader">
                        <span>Proposed Workflow Architecture</span>
                        <small>{msg.pipelinePreview.length} Nodes</small>
                      </div>
                      <div className="gauravPipelineSteps">
                        {msg.pipelinePreview.map((step, idx) => (
                          <div key={idx} className="gauravPipelineItem">
                            <span className="gauravStepNum">{idx + 1}</span>
                            <span className="gauravStepIcon">{step.icon}</span>
                            <div className="gauravStepInfo">
                              <strong>{step.label}</strong>
                              <small>{step.desc}</small>
                            </div>
                            <span className="gauravStepRole">{step.role}</span>
                          </div>
                        ))}
                      </div>
                      <div className="gauravPipelineFooter">
                        <span className="gauravPhase2Pill">
                          Phase 2 Ready: One-click "Build on Canvas" unlocks in Phase 2
                        </span>
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
                <span className="gauravThinkingText">Architecting workflow</span>
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
              placeholder="Describe your automation in plain English..."
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
              title="Send message (Enter)"
            >
              {loading ? '…' : '↑'}
            </button>
          </div>
          <div className="gauravInputHelp">
            <span>Press Enter to send, Shift+Enter for new line.</span>
            <span>GRA AI Architect v1.0</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
