"""Support chatbot for Kin Mission Control.

Provides knowledge base lookup, answer generation, and human escalation
for customer support interactions.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

# Configure logging
logger = logging.getLogger(__name__)


class MessageRole(Enum):
    """Chat message role."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class SessionStatus(Enum):
    """Support session status."""
    ACTIVE = "active"
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    CLOSED = "closed"


class EscalationPriority(Enum):
    """Escalation priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class ChatMessage:
    """A single chat message."""
    role: MessageRole
    content: str
    message_id: str = field(default_factory=lambda: f"msg-{uuid.uuid4().hex[:8]}")
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "message_id": self.message_id,
            "role": self.role.value,
            "content": self.content,
            "timestamp": self.timestamp,
        }
        if self.metadata:
            result["metadata"] = self.metadata
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ChatMessage":
        """Create from dictionary."""
        return cls(
            message_id=data.get("message_id", ""),
            role=MessageRole(data.get("role", "user")),
            content=data.get("content", ""),
            timestamp=data.get("timestamp", datetime.now(timezone.utc).isoformat()),
            metadata=data.get("metadata", {}),
        )


@dataclass
class EscalationInfo:
    """Escalation details."""
    escalation_id: str
    reason: str
    queued_at: str
    priority: EscalationPriority = EscalationPriority.MEDIUM
    assigned_to: str | None = None
    status: str = "queued"

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "escalation_id": self.escalation_id,
            "reason": self.reason,
            "queued_at": self.queued_at,
            "priority": self.priority.value,
            "status": self.status,
        }
        if self.assigned_to is not None:
            result["assigned_to"] = self.assigned_to
        return result


@dataclass
class Answer:
    """Chatbot answer result."""
    content: str
    kb_article: str | None = None
    confidence: float = 0.0
    suggested_questions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "content": self.content,
            "kb_article": self.kb_article,
            "confidence": self.confidence,
            "suggested_questions": self.suggested_questions,
        }


@dataclass
class SupportSession:
    """A support chat session."""
    session_id: str
    owner_id: str
    record_id: str = field(default_factory=lambda: f"ss-{uuid.uuid4().hex[:8]}")
    messages: list[ChatMessage] = field(default_factory=list)
    status: SessionStatus = SessionStatus.ACTIVE
    escalation_queued: bool = False
    escalation: EscalationInfo | None = None
    schema_family: str = "support_session"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "record_id": self.record_id,
            "schema_family": self.schema_family,
            "session_id": self.session_id,
            "owner_id": self.owner_id,
            "messages": [m.to_dict() for m in self.messages],
            "status": self.status.value,
            "escalation_queued": self.escalation_queued,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if self.escalation is not None:
            result["escalation"] = self.escalation.to_dict()
        return result


class KnowledgeBase:
    """Knowledge base for support articles."""

    def __init__(self, kb_path: str | Path):
        """Initialize knowledge base.

        Args:
            kb_path: Path to knowledge base directory
        """
        self.kb_path = Path(kb_path)
        self.articles: dict[str, str] = {}
        self._load_articles()

    def _load_articles(self) -> None:
        """Load all markdown articles from KB directory."""
        if not self.kb_path.exists():
            logger.warning(f"Knowledge base path does not exist: {self.kb_path}")
            return

        for md_file in self.kb_path.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")
                article_id = md_file.stem
                self.articles[article_id] = content
                logger.debug(f"Loaded article: {article_id}")
            except Exception as e:
                logger.error(f"Failed to load article {md_file}: {e}")

        logger.info(f"Loaded {len(self.articles)} knowledge base articles")

    def search(self, query: str, limit: int = 3) -> list[tuple[str, float, str]]:
        """Search for relevant articles.

        Args:
            query: Search query
            limit: Maximum results to return

        Returns:
            List of (article_id, score, excerpt) tuples
        """
        query_terms = set(re.findall(r'\w+', query.lower()))
        results: list[tuple[str, float, str]] = []

        for article_id, content in self.articles.items():
            # Simple keyword matching with scoring
            content_lower = content.lower()
            score = 0.0

            for term in query_terms:
                if term in content_lower:
                    # Count occurrences for scoring
                    count = content_lower.count(term)
                    score += min(count * 0.1, 1.0)

            if score > 0:
                # Extract relevant excerpt
                excerpt = self._extract_excerpt(content, query_terms)
                results.append((article_id, score, excerpt))

        # Sort by score descending
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:limit]

    def _extract_excerpt(self, content: str, query_terms: set[str], max_length: int = 200) -> str:
        """Extract relevant excerpt from article.

        Args:
            content: Full article content
            query_terms: Query terms to highlight
            max_length: Maximum excerpt length

        Returns:
            Relevant excerpt string
        """
        lines = content.split('\n')
        best_line = ""
        best_score = 0

        for line in lines:
            if not line.strip() or line.startswith('#'):
                continue

            line_lower = line.lower()
            score = sum(1 for term in query_terms if term in line_lower)

            if score > best_score:
                best_score = score
                best_line = line.strip()

        if not best_line:
            # Return first non-empty, non-header line
            for line in lines:
                if line.strip() and not line.startswith('#'):
                    best_line = line.strip()
                    break

        if len(best_line) > max_length:
            best_line = best_line[:max_length] + "..."

        return best_line

    def get_article(self, article_id: str) -> str | None:
        """Get full article content by ID.

        Args:
            article_id: Article identifier (filename without .md)

        Returns:
            Article content or None if not found
        """
        return self.articles.get(article_id)


class SupportChatbot:
    """Support chatbot with knowledge base lookup and escalation."""

    # Keywords that suggest escalation
    ESCALATION_KEYWORDS = [
        "urgent", "emergency", "critical", "asap",
        "angry", "frustrated", "unacceptable", "terrible",
        "lawsuit", "legal", "refund", "complaint",
        "manager", "supervisor", "human", "person",
    ]

    # Greeting patterns
    GREETINGS = [
        r'\b(hi|hello|hey|good morning|good afternoon|good evening)\b',
    ]

    # Help patterns
    HELP_PATTERNS = [
        r'\bhelp\b', r'\bhow do i\b', r'\bhow to\b', r'\bwhat is\b',
        r'\bcan you\b', r'\bhow can\b', r'\bguide\b', r'\binstructions\b',
    ]

    def __init__(self, kb_path: str | Path | None = None):
        """Initialize support chatbot.

        Args:
            kb_path: Path to knowledge base directory (defaults to data/support-kb)
        """
        if kb_path is None:
            kb_path = Path(__file__).parent.parent / "data" / "support-kb"

        self.kb = KnowledgeBase(kb_path)
        self.sessions: dict[str, SupportSession] = {}

    def create_session(self, owner_id: str) -> SupportSession:
        """Create a new support session.

        Args:
            owner_id: Owner identifier

        Returns:
            New SupportSession
        """
        session_id = f"session-{uuid.uuid4().hex[:12]}"
        session = SupportSession(
            session_id=session_id,
            owner_id=owner_id,
        )
        self.sessions[session_id] = session
        logger.info(f"Created support session {session_id} for owner {owner_id}")
        return session

    def get_session(self, session_id: str) -> SupportSession | None:
        """Get an existing session.

        Args:
            session_id: Session identifier

        Returns:
            SupportSession or None if not found
        """
        return self.sessions.get(session_id)

    def answer(
        self,
        question: str,
        session_id: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> Answer:
        """Generate an answer for a question.

        Args:
            question: User's question
            session_id: Optional session ID to record message
            context: Additional context (owner_id, etc.)

        Returns:
            Answer with content and metadata
        """
        question_lower = question.lower().strip()

        # Check for greetings
        for pattern in self.GREETINGS:
            if re.search(pattern, question_lower):
                answer = Answer(
                    content="Hello! I'm here to help with any questions about your Kin companions. What would you like to know?",
                    confidence=1.0,
                    suggested_questions=[
                        "How do I set up remote access?",
                        "What are voice features?",
                        "How do NFT avatars work?",
                    ],
                )
                if session_id:
                    self._record_message(session_id, question, answer)
                return answer

        # Check for help patterns or search KB
        search_results = self.kb.search(question)

        if search_results:
            best_article_id, score, excerpt = search_results[0]

            # Generate answer based on article
            article_content = self.kb.get_article(best_article_id)
            if article_content:
                # Extract relevant section
                answer_content = self._generate_answer_from_article(
                    question, article_content, excerpt
                )

                answer = Answer(
                    content=answer_content,
                    kb_article=best_article_id,
                    confidence=min(score / 2, 0.95),  # Normalize confidence
                    suggested_questions=self._get_suggested_questions(best_article_id),
                )

                if session_id:
                    self._record_message(session_id, question, answer)
                return answer

        # Fallback response
        answer = Answer(
            content="I'm not sure I understand your question. Could you rephrase it, or would you like to speak with a human support agent?",
            confidence=0.3,
            suggested_questions=[
                "Connect me with human support",
                "Show me the troubleshooting guide",
                "What can you help with?",
            ],
        )

        if session_id:
            self._record_message(session_id, question, answer)
        return answer

    def _generate_answer_from_article(
        self,
        question: str,
        article_content: str,
        excerpt: str,
    ) -> str:
        """Generate answer text from article content.

        Args:
            question: User's question
            article_content: Full article content
            excerpt: Relevant excerpt

        Returns:
            Answer text
        """
        # Simple answer generation - use excerpt and add context
        # In production, this could use an LLM for better synthesis

        # Find the article title
        lines = article_content.split('\n')
        title = "this topic"
        for line in lines:
            if line.startswith('# '):
                title = line[2:].strip()
                break

        return f"Based on {title}: {excerpt}\n\nWould you like more details on this topic?"

    def _get_suggested_questions(self, article_id: str) -> list[str]:
        """Get suggested follow-up questions for an article.

        Args:
            article_id: Article identifier

        Returns:
            List of suggested questions
        """
        suggestions_map = {
            "getting-started": [
                "How do I enable voice features?",
                "How do I set up remote access?",
            ],
            "tailscale-setup": [
                "What if the QR code doesn't work?",
                "How do I connect multiple devices?",
            ],
            "voice-features": [
                "Why isn't my microphone working?",
                "How do I improve voice quality?",
            ],
            "nft-avatars": [
                "How do I verify my NFT ownership?",
                "Can I customize my avatar?",
            ],
            "troubleshooting": [
                "My Kin shows offline, what do I do?",
                "How do I contact human support?",
            ],
        }
        return suggestions_map.get(article_id, ["How else can I help?"])

    def _record_message(self, session_id: str, question: str, answer: Answer) -> None:
        """Record messages in session.

        Args:
            session_id: Session identifier
            question: User question
            answer: Bot answer
        """
        session = self.sessions.get(session_id)
        if not session:
            return

        # Add user message
        session.messages.append(ChatMessage(
            role=MessageRole.USER,
            content=question,
        ))

        # Add assistant message
        metadata = {}
        if answer.kb_article:
            metadata["kb_article"] = answer.kb_article
        if answer.confidence:
            metadata["confidence"] = answer.confidence

        session.messages.append(ChatMessage(
            role=MessageRole.ASSISTANT,
            content=answer.content,
            metadata=metadata,
        ))

        session.updated_at = datetime.now(timezone.utc).isoformat()

    def escalate(
        self,
        session_id: str,
        reason: str,
        priority: EscalationPriority = EscalationPriority.MEDIUM,
    ) -> EscalationInfo | None:
        """Escalate a session to human support.

        Args:
            session_id: Session identifier
            reason: Reason for escalation
            priority: Escalation priority level

        Returns:
            EscalationInfo or None if session not found
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.error(f"Session not found for escalation: {session_id}")
            return None

        escalation = EscalationInfo(
            escalation_id=f"esc-{uuid.uuid4().hex[:8]}",
            reason=reason,
            queued_at=datetime.now(timezone.utc).isoformat(),
            priority=priority,
        )

        session.escalation = escalation
        session.escalation_queued = True
        session.status = SessionStatus.ESCALATED
        session.updated_at = datetime.now(timezone.utc).isoformat()

        # Add system message about escalation
        session.messages.append(ChatMessage(
            role=MessageRole.SYSTEM,
            content=f"Session escalated to human support. Reason: {reason}",
        ))

        logger.info(f"Escalated session {session_id} with priority {priority.value}")
        return escalation

    def check_escalation_needed(self, question: str) -> bool:
        """Check if question suggests escalation needed.

        Args:
            question: User's question/message

        Returns:
            True if escalation keywords detected
        """
        question_lower = question.lower()
        return any(kw in question_lower for kw in self.ESCALATION_KEYWORDS)

    def close_session(self, session_id: str) -> bool:
        """Close a support session.

        Args:
            session_id: Session identifier

        Returns:
            True if session was closed
        """
        session = self.sessions.get(session_id)
        if not session:
            return False

        session.status = SessionStatus.CLOSED
        session.updated_at = datetime.now(timezone.utc).isoformat()
        logger.info(f"Closed session {session_id}")
        return True


def create_support_chatbot(kb_path: str | Path | None = None) -> SupportChatbot:
    """Factory function to create a support chatbot.

    Args:
        kb_path: Optional path to knowledge base

    Returns:
        Configured SupportChatbot instance
    """
    return SupportChatbot(kb_path=kb_path)
