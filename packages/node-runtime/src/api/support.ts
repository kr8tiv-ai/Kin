/**
 * Support API endpoints for Mission Control.
 *
 * Provides chatbot interaction, session management, and escalation
 * for customer support.
 */

import express, { Request, Response, Router } from 'express';

// Types matching Python schema
interface ChatMessage {
  message_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    kb_article?: string;
    confidence?: number;
  };
}

interface EscalationInfo {
  escalation_id: string;
  reason: string;
  queued_at: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  status: 'queued' | 'assigned' | 'in_progress' | 'resolved';
}

interface SupportSession {
  record_id: string;
  schema_family: 'support_session';
  session_id: string;
  owner_id: string;
  messages: ChatMessage[];
  status: 'active' | 'resolved' | 'escalated' | 'closed';
  escalation_queued: boolean;
  escalation?: EscalationInfo;
  created_at: string;
  updated_at: string;
}

interface ChatRequest {
  session_id?: string;
  message: string;
  owner_id?: string;
}

interface ChatResponse {
  session_id: string;
  message: ChatMessage;
  suggested_questions?: string[];
  escalation_needed?: boolean;
}

// Mock session storage
const sessions = new Map<string, SupportSession>();

// Knowledge base for mock responses
const MOCK_KB: Record<string, { answer: string; questions: string[] }> = {
  'getting started': {
    answer: "Welcome to Kin! To get started, browse the marketplace to claim your first companion, then access Mission Control to manage it. You can enable voice features, set up remote access with Tailscale, and customize your Kin's preferences.",
    questions: ['How do I enable voice features?', 'How do I set up remote access?'],
  },
  'tailscale': {
    answer: "To set up remote access, click 'Setup Remote Access' in Mission Control sidebar. Install Tailscale on your device, then scan the QR code or copy the auth key. Your device will be securely connected to your Kin network.",
    questions: ['What if the QR code doesn\'t work?', 'How do I connect multiple devices?'],
  },
  'voice': {
    answer: "Voice features let you have natural spoken conversations with your Kin. Enable Voice Loop in your Kin's settings, grant microphone permissions, and start talking. Use headphones for better quality.",
    questions: ['Why isn\'t my microphone working?', 'How do I improve voice quality?'],
  },
  'nft': {
    answer: "Your Kin's avatar is a GLB 3D model linked to a Solana NFT. This provides on-chain identity verification. View your animated avatar in Mission Control, and verify ownership through your Solana wallet.",
    questions: ['How do I verify my NFT ownership?', 'Can I customize my avatar?'],
  },
  'troubleshoot': {
    answer: "For connection issues, check your internet and verify the host device is powered on. For voice problems, check microphone permissions. Use the Network Health widget to monitor device status.",
    questions: ['My Kin shows offline, what do I do?', 'How do I contact human support?'],
  },
};

const DEFAULT_RESPONSE = {
  answer: "I'm not sure I understand your question. Could you rephrase it, or would you like to speak with a human support agent?",
  questions: ['Connect me with human support', 'Show me the troubleshooting guide', 'What can you help with?'],
};

const GREETINGS = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
const ESCALATION_KEYWORDS = ['urgent', 'emergency', 'human', 'person', 'manager', 'supervisor', 'escalate'];

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 12)}`;
}

function findKBResponse(message: string): { answer: string; questions: string[]; kbArticle?: string } {
  const lower = message.toLowerCase();

  // Check for greetings
  if (GREETINGS.some(g => lower.includes(g))) {
    return {
      answer: "Hello! I'm here to help with any questions about your Kin companions. What would you like to know?",
      questions: ['How do I set up remote access?', 'What are voice features?', 'How do NFT avatars work?'],
    };
  }

  // Check for KB matches
  for (const [key, value] of Object.entries(MOCK_KB)) {
    if (lower.includes(key)) {
      return { ...value, kbArticle: key };
    }
  }

  // Keyword matching
  if (lower.includes('remote') || lower.includes('access') || lower.includes('vpn')) {
    return { ...MOCK_KB.tailscale, kbArticle: 'tailscale' };
  }
  if (lower.includes('voice') || lower.includes('microphone') || lower.includes('speak')) {
    return { ...MOCK_KB.voice, kbArticle: 'voice' };
  }
  if (lower.includes('nft') || lower.includes('avatar') || lower.includes('glb')) {
    return { ...MOCK_KB.nft, kbArticle: 'nft' };
  }
  if (lower.includes('start') || lower.includes('claim') || lower.includes('begin')) {
    return { ...MOCK_KB['getting started'], kbArticle: 'getting-started' };
  }
  if (lower.includes('problem') || lower.includes('issue') || lower.includes('error') || lower.includes('not working')) {
    return { ...MOCK_KB.troubleshoot, kbArticle: 'troubleshooting' };
  }

  return DEFAULT_RESPONSE;
}

function checkEscalationNeeded(message: string): boolean {
  const lower = message.toLowerCase();
  return ESCALATION_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * POST /api/support/chat
 * Send a message and get a chatbot response
 */
export async function handleChat(req: Request, res: Response): Promise<void> {
  const { session_id, message, owner_id } = req.body as ChatRequest;

  if (!message) {
    res.status(400).json({
      error: 'Missing required field',
      message: 'message is required',
    });
    return;
  }

  try {
    // Get or create session
    let session: SupportSession;
    if (session_id && sessions.has(session_id)) {
      session = sessions.get(session_id)!;
    } else {
      session = {
        record_id: generateId('ss'),
        schema_family: 'support_session',
        session_id: generateId('session'),
        owner_id: owner_id || 'anonymous',
        messages: [],
        status: 'active',
        escalation_queued: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      sessions.set(session.session_id, session);
    }

    // Add user message
    const userMessage: ChatMessage = {
      message_id: generateId('msg'),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    session.messages.push(userMessage);

    // Get response
    const kbResponse = findKBResponse(message);
    const escalationNeeded = checkEscalationNeeded(message);

    // Add assistant message
    const assistantMessage: ChatMessage = {
      message_id: generateId('msg'),
      role: 'assistant',
      content: kbResponse.answer,
      timestamp: new Date().toISOString(),
    };
    if (kbResponse.kbArticle) {
      assistantMessage.metadata = { kb_article: kbResponse.kbArticle };
    }
    session.messages.push(assistantMessage);
    session.updated_at = new Date().toISOString();

    const response: ChatResponse = {
      session_id: session.session_id,
      message: assistantMessage,
      suggested_questions: kbResponse.questions,
      escalation_needed: escalationNeeded,
    };

    res.json(response);
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({
      error: 'Failed to process message',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/support/sessions/:id
 * Get session history
 */
export async function getSession(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const session = sessions.get(id);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        session_id: id,
      });
      return;
    }

    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * POST /api/support/escalate
 * Escalate to human support
 */
export async function handleEscalate(req: Request, res: Response): Promise<void> {
  const { session_id, reason, priority = 'medium' } = req.body;

  if (!session_id || !reason) {
    res.status(400).json({
      error: 'Missing required fields',
      message: 'session_id and reason are required',
    });
    return;
  }

  try {
    const session = sessions.get(session_id);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        session_id,
      });
      return;
    }

    const escalation: EscalationInfo = {
      escalation_id: generateId('esc'),
      reason,
      queued_at: new Date().toISOString(),
      priority,
      status: 'queued',
    };

    session.escalation = escalation;
    session.escalation_queued = true;
    session.status = 'escalated';
    session.updated_at = new Date().toISOString();

    // Add system message
    session.messages.push({
      message_id: generateId('msg'),
      role: 'system',
      content: `Session escalated to human support. Reason: ${reason}`,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      escalation,
      session_id,
    });
  } catch (error) {
    console.error('Error escalating:', error);
    res.status(500).json({
      error: 'Failed to escalate',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/support/kb/articles
 * List knowledge base articles
 */
export async function listKBArticles(req: Request, res: Response): Promise<void> {
  try {
    const articles = [
      { id: 'getting-started', title: 'Getting Started with Kin' },
      { id: 'tailscale-setup', title: 'Tailscale Remote Access Setup' },
      { id: 'voice-features', title: 'Voice Features Guide' },
      { id: 'nft-avatars', title: 'NFT Avatars and GLB Identity' },
      { id: 'troubleshooting', title: 'Troubleshooting Guide' },
    ];

    res.json({ articles });
  } catch (error) {
    console.error('Error listing KB articles:', error);
    res.status(500).json({
      error: 'Failed to list articles',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * POST /api/support/sessions/:id/close
 * Close a support session
 */
export async function closeSession(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const session = sessions.get(id);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        session_id: id,
      });
      return;
    }

    session.status = 'closed';
    session.updated_at = new Date().toISOString();

    res.json({
      success: true,
      session_id: id,
      status: 'closed',
    });
  } catch (error) {
    console.error('Error closing session:', error);
    res.status(500).json({
      error: 'Failed to close session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Router factory
export function createSupportRouter(): Router {
  const router = Router();

  router.post('/chat', handleChat);
  router.get('/sessions/:id', getSession);
  router.post('/escalate', handleEscalate);
  router.get('/kb/articles', listKBArticles);
  router.post('/sessions/:id/close', closeSession);

  return router;
}

export default createSupportRouter;
