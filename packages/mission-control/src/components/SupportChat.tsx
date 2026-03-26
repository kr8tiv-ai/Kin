/**
 * SupportChat component for customer support interactions.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useSupportChat } from '../hooks/useSupportChat';
import { EscalationQueue } from './EscalationQueue';

interface SupportChatProps {
  ownerId?: string;
  className?: string;
}

export function SupportChat({
  ownerId,
  className = '',
}: SupportChatProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showEscalation, setShowEscalation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    loading,
    error,
    sendMessage,
    escalate,
    suggestedQuestions,
  } = useSupportChat({
    ownerId,
    onEscalationNeeded: () => setShowEscalation(true),
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage(message);
  };

  const handleQuickQuestion = (question: string) => {
    setInputValue(question);
  };

  const handleEscalate = async (reason: string) => {
    const success = await escalate(reason, 'medium');
    if (success) {
      setShowEscalation(true);
    }
  };

  if (!isOpen) {
    return (
      <button
        className={`support-chat-button ${className}`}
        onClick={() => setIsOpen(true)}
        aria-label="Open support chat"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="chat-label">Support</span>

        <style>{`
          .support-chat-button {
            position: fixed;
            bottom: 24px;
            right: 24px;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            border: none;
            border-radius: 30px;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
            transition: all 0.3s ease;
            z-index: 1000;
          }

          .support-chat-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(99, 102, 241, 0.5);
          }

          .chat-label {
            font-weight: 500;
          }

          @media (max-width: 640px) {
            .chat-label {
              display: none;
            }
          }
        `}</style>
      </button>
    );
  }

  return (
    <div className={`support-chat-container ${className}`}>
      <div className="chat-header">
        <div className="header-info">
          <h3>Support Chat</h3>
          <span className="status">Online</span>
        </div>
        <button
          className="close-btn"
          onClick={() => setIsOpen(false)}
          aria-label="Close chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="welcome-message">
            <div className="welcome-icon">💬</div>
            <h4>Hi! How can I help?</h4>
            <p>Ask me anything about your Kin companions.</p>
            <div className="quick-actions">
              <button onClick={() => handleQuickQuestion("How do I set up remote access?")}>
                Set up remote access
              </button>
              <button onClick={() => handleQuickQuestion("What are voice features?")}>
                Voice features
              </button>
              <button onClick={() => handleQuickQuestion("Show troubleshooting guide")}>
                Troubleshooting
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.message_id} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.content}
            </div>
            <div className="message-time">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant loading">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {error && (
          <div className="message system error">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {suggestedQuestions.length > 0 && !showEscalation && (
        <div className="suggested-questions">
          {suggestedQuestions.slice(0, 3).map((q, i) => (
            <button
              key={i}
              className="suggested-btn"
              onClick={() => handleQuickQuestion(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {showEscalation ? (
        <EscalationQueue
          onResolve={() => setShowEscalation(false)}
          onCancel={() => setShowEscalation(false)}
        />
      ) : (
        <form className="input-area" onSubmit={handleSubmit}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || loading}
            className="send-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22,2 15,22 11,13 2,9" />
            </svg>
          </button>
          <button
            type="button"
            className="escalate-btn"
            onClick={() => handleEscalate("User requested human support")}
            title="Talk to a human"
          >
            👤
          </button>
        </form>
      )}

      <style>{`
        .support-chat-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 380px;
          max-height: 600px;
          background: var(--card-bg, #1a1a2e);
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          z-index: 1000;
          overflow: hidden;
        }

        @media (max-width: 420px) {
          .support-chat-container {
            width: calc(100vw - 32px);
            right: 16px;
            bottom: 16px;
            max-height: calc(100vh - 100px);
          }
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
        }

        .header-info h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .status {
          font-size: 12px;
          opacity: 0.8;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          padding: 4px;
          opacity: 0.8;
          transition: opacity 0.2s;
        }

        .close-btn:hover {
          opacity: 1;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          min-height: 200px;
          max-height: 400px;
        }

        .welcome-message {
          text-align: center;
          padding: 24px 16px;
        }

        .welcome-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .welcome-message h4 {
          margin: 0 0 8px 0;
        }

        .welcome-message p {
          color: var(--text-secondary, #9ca3af);
          margin: 0 0 16px 0;
        }

        .quick-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .quick-actions button {
          background: var(--input-bg, #0f0f1a);
          border: 1px solid var(--border, #374151);
          color: var(--text, #e5e7eb);
          padding: 10px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        .quick-actions button:hover {
          background: var(--hover, #1f2937);
          border-color: var(--primary, #6366f1);
        }

        .message {
          margin-bottom: 12px;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
          text-align: right;
        }

        .message-content {
          display: inline-block;
          padding: 10px 14px;
          border-radius: 12px;
          max-width: 85%;
          word-wrap: break-word;
        }

        .message.user .message-content {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message.assistant .message-content {
          background: var(--input-bg, #0f0f1a);
          border-bottom-left-radius: 4px;
        }

        .message.system .message-content {
          background: rgba(251, 191, 36, 0.1);
          color: var(--warning, #f59e0b);
          font-size: 13px;
        }

        .message.system.error .message-content {
          background: rgba(239, 68, 68, 0.1);
          color: var(--error, #ef4444);
        }

        .message-time {
          font-size: 10px;
          color: var(--text-secondary, #9ca3af);
          margin-top: 4px;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 12px 16px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: var(--text-secondary, #9ca3af);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) { animation-delay: 0s; }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }

        .suggested-questions {
          padding: 8px 16px;
          display: flex;
          gap: 6px;
          overflow-x: auto;
          border-top: 1px solid var(--border, #374151);
        }

        .suggested-btn {
          flex-shrink: 0;
          background: var(--input-bg, #0f0f1a);
          border: 1px solid var(--border, #374151);
          color: var(--text, #e5e7eb);
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .suggested-btn:hover {
          border-color: var(--primary, #6366f1);
        }

        .input-area {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid var(--border, #374151);
          background: var(--card-bg, #1a1a2e);
        }

        .input-area input {
          flex: 1;
          background: var(--input-bg, #0f0f1a);
          border: 1px solid var(--border, #374151);
          border-radius: 24px;
          padding: 10px 16px;
          color: var(--text, #e5e7eb);
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .input-area input:focus {
          border-color: var(--primary, #6366f1);
        }

        .send-btn, .escalate-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .send-btn {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
        }

        .send-btn:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .escalate-btn {
          background: var(--input-bg, #0f0f1a);
          border: 1px solid var(--border, #374151);
        }

        .escalate-btn:hover {
          border-color: var(--warning, #f59e0b);
        }
      `}</style>
    </div>
  );
}

export default SupportChat;
