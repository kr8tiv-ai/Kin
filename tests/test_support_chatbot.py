"""Unit tests for SupportChatbot."""

import pytest
from pathlib import Path
import tempfile

from runtime_types.support_chatbot import (
    SupportChatbot,
    SupportSession,
    KnowledgeBase,
    ChatMessage,
    Answer,
    EscalationInfo,
    EscalationPriority,
    MessageRole,
    SessionStatus,
    create_support_chatbot,
)


@pytest.fixture
def temp_kb():
    """Create a temporary knowledge base for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        kb_path = Path(tmpdir)

        # Create test articles
        (kb_path / "test-article.md").write_text("""# Test Article

This is a test article about testing.

## Section 1

Testing is important for software quality.

## Section 2

You should write tests for all your code.
""")

        (kb_path / "getting-started.md").write_text("""# Getting Started

Welcome to the getting started guide.

## Setup

Follow these steps to get started.
""")

        yield kb_path


class TestKnowledgeBase:
    """Tests for KnowledgeBase class."""

    def test_loads_articles_from_directory(self, temp_kb):
        """Test that articles are loaded from directory."""
        kb = KnowledgeBase(temp_kb)

        assert len(kb.articles) == 2
        assert "test-article" in kb.articles
        assert "getting-started" in kb.articles

    def test_search_finds_relevant_articles(self, temp_kb):
        """Test that search returns relevant results."""
        kb = KnowledgeBase(temp_kb)

        results = kb.search("testing")

        assert len(results) >= 1
        article_id, score, excerpt = results[0]
        assert article_id == "test-article"
        assert score > 0
        assert "test" in excerpt.lower()

    def test_search_returns_empty_for_no_matches(self, temp_kb):
        """Test that search returns empty when no matches."""
        kb = KnowledgeBase(temp_kb)

        results = kb.search("nonexistent-topic-xyz")

        assert len(results) == 0

    def test_get_article_returns_content(self, temp_kb):
        """Test that get_article returns article content."""
        kb = KnowledgeBase(temp_kb)

        content = kb.get_article("test-article")

        assert content is not None
        assert "# Test Article" in content

    def test_get_article_returns_none_for_unknown(self, temp_kb):
        """Test that get_article returns None for unknown article."""
        kb = KnowledgeBase(temp_kb)

        content = kb.get_article("nonexistent")

        assert content is None


class TestChatMessage:
    """Tests for ChatMessage dataclass."""

    def test_creates_message_with_defaults(self):
        """Test that message is created with default values."""
        msg = ChatMessage(
            role=MessageRole.USER,
            content="Hello",
        )

        assert msg.role == MessageRole.USER
        assert msg.content == "Hello"
        assert msg.message_id.startswith("msg-")
        assert msg.timestamp is not None

    def test_to_dict_includes_required_fields(self):
        """Test that to_dict includes all required fields."""
        msg = ChatMessage(
            role=MessageRole.ASSISTANT,
            content="Hi there",
        )
        result = msg.to_dict()

        assert "message_id" in result
        assert "role" in result
        assert result["role"] == "assistant"
        assert "content" in result
        assert "timestamp" in result

    def test_to_dict_includes_metadata_when_present(self):
        """Test that metadata is included when present."""
        msg = ChatMessage(
            role=MessageRole.ASSISTANT,
            content="Answer",
            metadata={"kb_article": "test-article", "confidence": 0.9},
        )
        result = msg.to_dict()

        assert "metadata" in result
        assert result["metadata"]["kb_article"] == "test-article"

    def test_from_dict_creates_message(self):
        """Test that from_dict creates a ChatMessage."""
        data = {
            "message_id": "msg-test123",
            "role": "user",
            "content": "Test question",
            "timestamp": "2026-03-24T04:00:00Z",
        }
        msg = ChatMessage.from_dict(data)

        assert msg.message_id == "msg-test123"
        assert msg.role == MessageRole.USER
        assert msg.content == "Test question"


class TestSupportSession:
    """Tests for SupportSession dataclass."""

    def test_creates_session_with_defaults(self):
        """Test that session is created with default values."""
        session = SupportSession(
            session_id="session-test",
            owner_id="owner-123",
        )

        assert session.session_id == "session-test"
        assert session.owner_id == "owner-123"
        assert session.record_id.startswith("ss-")
        assert session.status == SessionStatus.ACTIVE
        assert session.escalation_queued is False

    def test_to_dict_includes_messages(self):
        """Test that to_dict includes message list."""
        session = SupportSession(
            session_id="session-test",
            owner_id="owner-123",
            messages=[
                ChatMessage(role=MessageRole.USER, content="Hello"),
                ChatMessage(role=MessageRole.ASSISTANT, content="Hi"),
            ],
        )
        result = session.to_dict()

        assert "messages" in result
        assert len(result["messages"]) == 2


class TestEscalationInfo:
    """Tests for EscalationInfo dataclass."""

    def test_creates_escalation_with_defaults(self):
        """Test that escalation is created with default values."""
        escalation = EscalationInfo(
            escalation_id="esc-test",
            reason="User request",
            queued_at="2026-03-24T04:00:00Z",
        )

        assert escalation.escalation_id == "esc-test"
        assert escalation.priority == EscalationPriority.MEDIUM
        assert escalation.status == "queued"

    def test_to_dict_includes_all_fields(self):
        """Test that to_dict includes all fields."""
        escalation = EscalationInfo(
            escalation_id="esc-test",
            reason="User request",
            queued_at="2026-03-24T04:00:00Z",
            priority=EscalationPriority.HIGH,
            assigned_to="agent-123",
        )
        result = escalation.to_dict()

        assert result["escalation_id"] == "esc-test"
        assert result["priority"] == "high"
        assert result["assigned_to"] == "agent-123"


class TestSupportChatbot:
    """Tests for SupportChatbot class."""

    def test_creates_session(self, temp_kb):
        """Test that create_session creates a new session."""
        bot = SupportChatbot(kb_path=temp_kb)
        session = bot.create_session("owner-123")

        assert session.session_id.startswith("session-")
        assert session.owner_id == "owner-123"
        assert session in bot.sessions.values()

    def test_get_session_returns_existing(self, temp_kb):
        """Test that get_session returns existing session."""
        bot = SupportChatbot(kb_path=temp_kb)
        created = bot.create_session("owner-123")

        retrieved = bot.get_session(created.session_id)

        assert retrieved is created

    def test_get_session_returns_none_for_unknown(self, temp_kb):
        """Test that get_session returns None for unknown ID."""
        bot = SupportChatbot(kb_path=temp_kb)

        result = bot.get_session("nonexistent")

        assert result is None

    def test_answer_returns_greeting_for_hello(self, temp_kb):
        """Test that answer returns greeting for hello."""
        bot = SupportChatbot(kb_path=temp_kb)
        answer = bot.answer("Hello!")

        assert "Hello" in answer.content or "hello" in answer.content.lower()
        assert answer.confidence > 0.5

    def test_answer_searches_knowledge_base(self, temp_kb):
        """Test that answer searches knowledge base."""
        bot = SupportChatbot(kb_path=temp_kb)
        answer = bot.answer("How do I get started?")

        assert answer.kb_article is not None
        assert answer.confidence > 0

    def test_answer_records_messages_in_session(self, temp_kb):
        """Test that answer records messages in session."""
        bot = SupportChatbot(kb_path=temp_kb)
        session = bot.create_session("owner-123")

        bot.answer("Hello", session_id=session.session_id)

        assert len(session.messages) == 2  # user + assistant

    def test_escalate_creates_escalation(self, temp_kb):
        """Test that escalate creates escalation record."""
        bot = SupportChatbot(kb_path=temp_kb)
        session = bot.create_session("owner-123")

        escalation = bot.escalate(
            session.session_id,
            "User requested human support",
            EscalationPriority.HIGH,
        )

        assert escalation is not None
        assert escalation.reason == "User requested human support"
        assert escalation.priority == EscalationPriority.HIGH
        assert session.escalation_queued is True
        assert session.status == SessionStatus.ESCALATED

    def test_escalate_returns_none_for_unknown_session(self, temp_kb):
        """Test that escalate returns None for unknown session."""
        bot = SupportChatbot(kb_path=temp_kb)

        result = bot.escalate("nonexistent", "reason")

        assert result is None

    def test_check_escalation_needed_detects_keywords(self, temp_kb):
        """Test that check_escalation_needed detects keywords."""
        bot = SupportChatbot(kb_path=temp_kb)

        assert bot.check_escalation_needed("This is urgent!") is True
        assert bot.check_escalation_needed("I want to speak to a human") is True
        assert bot.check_escalation_needed("How do I get started?") is False

    def test_close_session_updates_status(self, temp_kb):
        """Test that close_session updates status."""
        bot = SupportChatbot(kb_path=temp_kb)
        session = bot.create_session("owner-123")

        result = bot.close_session(session.session_id)

        assert result is True
        assert session.status == SessionStatus.CLOSED

    def test_close_session_returns_false_for_unknown(self, temp_kb):
        """Test that close_session returns False for unknown session."""
        bot = SupportChatbot(kb_path=temp_kb)

        result = bot.close_session("nonexistent")

        assert result is False


class TestCreateSupportChatbot:
    """Tests for factory function."""

    def test_creates_chatbot_with_default_path(self):
        """Test that factory creates chatbot without path."""
        bot = create_support_chatbot()

        assert isinstance(bot, SupportChatbot)

    def test_creates_chatbot_with_custom_path(self, temp_kb):
        """Test that factory creates chatbot with custom path."""
        bot = create_support_chatbot(kb_path=temp_kb)

        assert isinstance(bot, SupportChatbot)
        assert len(bot.kb.articles) > 0
