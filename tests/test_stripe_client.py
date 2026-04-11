"""
Tests for StripeClient.
"""

import pytest
from datetime import datetime, timezone

from runtime_types.stripe_client import (
    StripeClient,
    SubscriptionRecord,
    UsageMetrics,
    Invoice,
    BillingCycle,
    PaymentMethod,
)


class TestStripeClientMock:
    """Tests for StripeClient in mock mode."""

    @pytest.fixture
    def client(self):
        """Create a StripeClient in mock mode."""
        return StripeClient()  # No API key = mock mode

    def test_initializes_in_mock_mode_without_api_key(self, client):
        """Should use mock mode when no API key provided."""
        assert client._mock_mode is True
        assert client.api_key is None

    def test_get_subscription_returns_mock_data(self, client):
        """Should return mock subscription data."""
        result = client.get_subscription("cus_test123")

        assert isinstance(result, SubscriptionRecord)
        assert result.tier == "hatchling"
        assert result.status == "active"
        assert result.owner_id == "owner-test123"

    def test_get_subscription_has_usage_metrics(self, client):
        """Subscription should include usage metrics."""
        result = client.get_subscription("cus_test123")

        assert isinstance(result.usage, UsageMetrics)
        assert result.usage.kin_count == 1
        assert result.usage.kin_limit == 1  # Hatchling tier
        assert result.usage.api_calls_limit == -1

    def test_get_subscription_has_payment_method(self, client):
        """Subscription should include payment method summary."""
        result = client.get_subscription("cus_test123")

        assert result.payment_method is not None
        assert result.payment_method.last_four == "4242"
        assert result.payment_method.brand == "visa"

    def test_get_usage_returns_mock_data(self, client):
        """Should return mock usage data."""
        result = client.get_usage("sub_test123")

        assert isinstance(result, UsageMetrics)
        assert result.kin_count == 1
        assert result.kin_limit == 1

    def test_upgrade_tier_succeeds_in_mock(self, client):
        """Should succeed in mock mode."""
        result = client.upgrade_tier("cus_test123", "hero")

        assert result is True

    def test_upgrade_tier_validates_tier(self, client):
        """Should reject invalid tier."""
        with pytest.raises(ValueError, match="Invalid tier"):
            client.upgrade_tier("cus_test123", "invalid_tier")

    def test_cancel_subscription_succeeds_in_mock(self, client):
        """Should succeed in mock mode."""
        result = client.cancel_subscription("cus_test123")

        assert result is True

    def test_get_invoices_returns_mock_data(self, client):
        """Should return mock invoice history."""
        result = client.get_invoices("cus_test123")

        assert len(result) == 3
        assert all(isinstance(inv, Invoice) for inv in result)
        assert result[0].status == "paid"
        assert result[0].amount == 11400


class TestTierDefinitions:
    """Tests for tier configuration."""

    @pytest.fixture
    def client(self):
        return StripeClient()

    def test_tiers_exist(self, client):
        """All expected tiers should be defined."""
        assert "free" in client.TIERS
        assert "hatchling" in client.TIERS
        assert "elder" in client.TIERS
        assert "hero" in client.TIERS

    def test_free_tier_limits(self, client):
        """Free tier should have basic limits."""
        free = client.TIERS["free"]
        assert free["price"] == 0
        assert free["kin_limit"] == 1
        assert free["api_calls_limit"] == 1000

    def test_elder_tier_limits(self, client):
        """Elder tier should have higher limits."""
        elder = client.TIERS["elder"]
        assert elder["price"] == 19400  # $194
        assert elder["kin_limit"] == 3
        assert elder["api_calls_limit"] == -1

    def test_hero_tier_limits(self, client):
        """Hero tier should unlock all companions and unlimited core resources."""
        hero = client.TIERS["hero"]
        assert hero["kin_limit"] == 6
        assert hero["api_calls_limit"] == -1
        assert hero["storage_limit_mb"] == -1

    def test_tier_features_progress(self, client):
        """Features should progress with tier."""
        free_features = client.TIERS["free"]["features"]
        elder_features = client.TIERS["elder"]["features"]

        # Elder should have more features enabled
        assert free_features["voice_mode"] is False
        assert elder_features["voice_mode"] is True


class TestDataclasses:
    """Tests for dataclass serialization."""

    def test_usage_metrics_to_dict(self):
        """UsageMetrics should serialize to dict."""
        metrics = UsageMetrics(
            kin_count=3,
            kin_limit=10,
            api_calls_current=5000,
            api_calls_limit=10000,
            storage_used_mb=100.0,
            storage_limit_mb=500.0,
        )

        result = metrics.to_dict()

        assert result["kin_count"] == 3
        assert result["kin_limit"] == 10
        assert result["api_calls_current"] == 5000

    def test_subscription_record_to_dict(self):
        """SubscriptionRecord should serialize to dict."""
        now = datetime.now(timezone.utc)
        record = SubscriptionRecord(
            record_id="sub-test",
            owner_id="owner-test",
            tier="elder",
            status="active",
            usage=UsageMetrics(
                kin_count=1,
                kin_limit=3,
                api_calls_current=0,
                api_calls_limit=-1,
                storage_used_mb=0,
                storage_limit_mb=10000,
            ),
            billing_cycle=BillingCycle(
                interval="month",
                current_period_start=now,
                current_period_end=now,
            ),
            renewal_date=now,
            created_at=now,
            updated_at=now,
        )

        result = record.to_dict()

        assert result["record_id"] == "sub-test"
        assert result["schema_family"] == "subscription_record"
        assert result["tier"] == "elder"
        assert "usage" in result
        assert "billing_cycle" in result

    def test_invoice_to_dict(self):
        """Invoice should serialize to dict."""
        now = datetime.now(timezone.utc)
        invoice = Invoice(
            invoice_id="in_test",
            number="INV-001",
            amount=11400,
            currency="usd",
            status="paid",
            created_at=now,
        )

        result = invoice.to_dict()

        assert result["invoice_id"] == "in_test"
        assert result["amount"] == 11400
        assert result["status"] == "paid"


class TestCreateFreeSubscription:
    """Tests for free tier creation."""

    def test_create_free_subscription(self):
        """Should create a valid free tier subscription."""
        client = StripeClient()
        result = client._create_free_subscription("owner-new123")

        assert result.tier == "free"
        assert result.status == "active"
        assert result.usage.kin_limit == 1
        assert result.billing_cycle.amount == 0
        assert result.features["voice_mode"] is False
