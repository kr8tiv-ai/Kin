"""
StripeClient - Interface with Stripe API for subscription management.

Provides methods to retrieve subscription status, usage metrics, and manage
tier changes. Uses mock data in development mode.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Configure logger
logger = logging.getLogger(__name__)


@dataclass
class UsageMetrics:
    """Usage data for a subscription."""
    kin_count: int
    kin_limit: int
    api_calls_current: int
    api_calls_limit: int
    storage_used_mb: float
    storage_limit_mb: float
    voice_minutes_current: float = 0.0
    voice_minutes_limit: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "kin_count": self.kin_count,
            "kin_limit": self.kin_limit,
            "api_calls_current": self.api_calls_current,
            "api_calls_limit": self.api_calls_limit,
            "storage_used_mb": self.storage_used_mb,
            "storage_limit_mb": self.storage_limit_mb,
            "voice_minutes_current": self.voice_minutes_current,
            "voice_minutes_limit": self.voice_minutes_limit,
        }


@dataclass
class BillingCycle:
    """Billing cycle information."""
    interval: str  # "month" or "year"
    current_period_start: datetime
    current_period_end: datetime
    amount: int = 0  # in cents
    currency: str = "usd"

    def to_dict(self) -> dict[str, Any]:
        return {
            "interval": self.interval,
            "current_period_start": self.current_period_start.isoformat(),
            "current_period_end": self.current_period_end.isoformat(),
            "amount": self.amount,
            "currency": self.currency,
        }


@dataclass
class PaymentMethod:
    """Payment method summary (no sensitive data)."""
    type: str
    last_four: str
    brand: str
    expiry_month: int
    expiry_year: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "last_four": self.last_four,
            "brand": self.brand,
            "expiry_month": self.expiry_month,
            "expiry_year": self.expiry_year,
        }


@dataclass
class SubscriptionRecord:
    """Subscription status and billing information."""
    record_id: str
    owner_id: str
    tier: str
    status: str
    usage: UsageMetrics
    billing_cycle: BillingCycle
    renewal_date: datetime
    created_at: datetime
    updated_at: datetime
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    trial_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    canceled_at: Optional[datetime] = None
    payment_method: Optional[PaymentMethod] = None
    features: dict[str, bool] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "record_id": self.record_id,
            "schema_family": "subscription_record",
            "owner_id": self.owner_id,
            "stripe_customer_id": self.stripe_customer_id,
            "stripe_subscription_id": self.stripe_subscription_id,
            "tier": self.tier,
            "status": self.status,
            "usage": self.usage.to_dict(),
            "billing_cycle": self.billing_cycle.to_dict(),
            "renewal_date": self.renewal_date.isoformat(),
            "trial_end": self.trial_end.isoformat() if self.trial_end else None,
            "cancel_at_period_end": self.cancel_at_period_end,
            "canceled_at": self.canceled_at.isoformat() if self.canceled_at else None,
            "payment_method": self.payment_method.to_dict() if self.payment_method else None,
            "features": self.features,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class Invoice:
    """Invoice record."""
    invoice_id: str
    number: str
    amount: int  # in cents
    currency: str
    status: str  # "draft", "open", "paid", "void", "uncollectible"
    created_at: datetime
    due_date: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    invoice_url: Optional[str] = None
    invoice_pdf: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "invoice_id": self.invoice_id,
            "number": self.number,
            "amount": self.amount,
            "currency": self.currency,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "invoice_url": self.invoice_url,
            "invoice_pdf": self.invoice_pdf,
        }


class StripeClient:
    """
    Client for interacting with Stripe API.

    In development mode (STRIPE_API_KEY not set), returns mock data.
    In production, makes real API calls to Stripe.
    """

    # Tier definitions
    TIERS = {
        "free": {
            "price": 0,
            "kin_limit": 1,
            "api_calls_limit": 1000,
            "storage_limit_mb": 100,
            "voice_minutes_limit": 10,
            "features": {
                "voice_mode": False,
                "custom_specializations": False,
                "priority_support": False,
                "api_access": False,
                "drift_alerts": False,
                "health_monitoring": False,
            },
        },
        "hatchling": {
            "price": 900,  # $9/month
            "kin_limit": 3,
            "api_calls_limit": 10000,
            "storage_limit_mb": 500,
            "voice_minutes_limit": 50,
            "features": {
                "voice_mode": True,
                "custom_specializations": False,
                "priority_support": False,
                "api_access": True,
                "drift_alerts": True,
                "health_monitoring": True,
            },
        },
        "elder": {
            "price": 2900,  # $29/month
            "kin_limit": 10,
            "api_calls_limit": 100000,
            "storage_limit_mb": 5000,
            "voice_minutes_limit": 500,
            "features": {
                "voice_mode": True,
                "custom_specializations": True,
                "priority_support": True,
                "api_access": True,
                "drift_alerts": True,
                "health_monitoring": True,
            },
        },
        "hero": {
            "price": 9900,  # $99/month
            "kin_limit": -1,  # unlimited
            "api_calls_limit": -1,
            "storage_limit_mb": -1,
            "voice_minutes_limit": -1,
            "features": {
                "voice_mode": True,
                "custom_specializations": True,
                "priority_support": True,
                "api_access": True,
                "drift_alerts": True,
                "health_monitoring": True,
                "dedicated_support": True,
                "sla": True,
            },
        },
    }

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Stripe client.

        Args:
            api_key: Stripe API key. If not provided, uses STRIPE_API_KEY env var
                     or falls back to mock mode.
        """
        self.api_key = api_key or os.environ.get("STRIPE_API_KEY")
        self._mock_mode = not self.api_key

        if self._mock_mode:
            logger.info("StripeClient running in mock mode (no API key provided)")
        else:
            logger.info("StripeClient initialized with API key")

        # Import stripe only if we have an API key
        self._stripe = None
        if not self._mock_mode:
            try:
                import stripe
                stripe.api_key = self.api_key
                self._stripe = stripe
            except ImportError:
                logger.warning("stripe package not installed, falling back to mock mode")
                self._mock_mode = True

    def get_subscription(self, customer_id: str) -> SubscriptionRecord:
        """
        Get subscription details for a customer.

        Args:
            customer_id: Stripe customer ID or owner ID

        Returns:
            SubscriptionRecord with current subscription details
        """
        if self._mock_mode:
            return self._get_mock_subscription(customer_id)

        try:
            # Get customer from Stripe
            customer = self._stripe.Customer.retrieve(customer_id)

            # Get active subscription
            subscriptions = self._stripe.Subscription.list(
                customer=customer_id,
                status="all",
                limit=1,
            )

            if not subscriptions.data:
                # No subscription, return free tier
                return self._create_free_subscription(customer_id)

            sub = subscriptions.data[0]

            return self._stripe_to_subscription_record(customer_id, sub)

        except Exception as e:
            logger.error(f"Failed to get subscription for {customer_id}: {e}")
            raise

    def get_usage(self, subscription_id: str) -> UsageMetrics:
        """
        Get usage metrics for a subscription.

        Args:
            subscription_id: Stripe subscription ID

        Returns:
            UsageMetrics with current usage data
        """
        if self._mock_mode:
            return self._get_mock_usage()

        try:
            # Get subscription to find tier
            sub = self._stripe.Subscription.retrieve(subscription_id)
            tier = self._get_tier_from_subscription(sub)

            # In production, usage would come from a usage tracking system
            # For now, return mock usage with correct limits
            return UsageMetrics(
                kin_count=3,
                kin_limit=self.TIERS[tier]["kin_limit"],
                api_calls_current=45000,
                api_calls_limit=self.TIERS[tier]["api_calls_limit"],
                storage_used_mb=250.0,
                storage_limit_mb=self.TIERS[tier]["storage_limit_mb"],
                voice_minutes_current=120.0,
                voice_minutes_limit=self.TIERS[tier]["voice_minutes_limit"],
            )

        except Exception as e:
            logger.error(f"Failed to get usage for {subscription_id}: {e}")
            raise

    def upgrade_tier(self, customer_id: str, new_tier: str) -> bool:
        """
        Upgrade or downgrade subscription tier.

        Args:
            customer_id: Stripe customer ID
            new_tier: Target tier (hatchling, elder, hero)

        Returns:
            True if successful
        """
        if new_tier not in self.TIERS:
            raise ValueError(f"Invalid tier: {new_tier}")

        if self._mock_mode:
            logger.info(f"Mock: Upgraded {customer_id} to {new_tier}")
            return True

        try:
            # Get current subscription
            subscriptions = self._stripe.Subscription.list(
                customer=customer_id,
                status="active",
                limit=1,
            )

            if not subscriptions.data:
                # Create new subscription
                self._create_subscription(customer_id, new_tier)
                return True

            sub = subscriptions.data[0]

            # Update subscription with new price
            new_price = self._get_price_id(new_tier)
            self._stripe.Subscription.modify(
                sub.id,
                items=[{"id": sub["items"]["data"][0].id, "price": new_price}],
                proration_behavior="create_prorations",
            )

            logger.info(f"Upgraded {customer_id} to {new_tier}")
            return True

        except Exception as e:
            logger.error(f"Failed to upgrade {customer_id} to {new_tier}: {e}")
            raise

    def cancel_subscription(self, customer_id: str, immediate: bool = False) -> bool:
        """
        Cancel a subscription.

        Args:
            customer_id: Stripe customer ID
            immediate: If True, cancel immediately. If False, cancel at period end.

        Returns:
            True if successful
        """
        if self._mock_mode:
            logger.info(f"Mock: Canceled subscription for {customer_id}")
            return True

        try:
            subscriptions = self._stripe.Subscription.list(
                customer=customer_id,
                status="active",
                limit=1,
            )

            if not subscriptions.data:
                return False

            sub = subscriptions.data[0]

            if immediate:
                self._stripe.Subscription.delete(sub.id)
            else:
                self._stripe.Subscription.modify(sub.id, cancel_at_period_end=True)

            logger.info(f"Canceled subscription for {customer_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to cancel subscription for {customer_id}: {e}")
            raise

    def get_invoices(self, customer_id: str, limit: int = 10) -> list[Invoice]:
        """
        Get billing history for a customer.

        Args:
            customer_id: Stripe customer ID
            limit: Maximum number of invoices to return

        Returns:
            List of Invoice objects
        """
        if self._mock_mode:
            return self._get_mock_invoices(customer_id, limit)

        try:
            invoices = self._stripe.Invoice.list(
                customer=customer_id,
                limit=limit,
            )

            return [
                Invoice(
                    invoice_id=inv.id,
                    number=inv.number or f"INV-{inv.id[:8]}",
                    amount=inv.amount_paid,
                    currency=inv.currency,
                    status=inv.status,
                    created_at=datetime.fromtimestamp(inv.created, tz=timezone.utc),
                    due_date=datetime.fromtimestamp(inv.due_date, tz=timezone.utc) if inv.due_date else None,
                    paid_at=datetime.fromtimestamp(inv.status_transitions.paid_at, tz=timezone.utc) if inv.status_transitions.paid_at else None,
                    invoice_url=inv.hosted_invoice_url,
                    invoice_pdf=inv.invoice_pdf,
                )
                for inv in invoices.data
            ]

        except Exception as e:
            logger.error(f"Failed to get invoices for {customer_id}: {e}")
            raise

    # --- Private methods ---

    def _get_tier_from_subscription(self, sub: Any) -> str:
        """Extract tier from Stripe subscription."""
        # This would map Stripe price IDs to tiers
        # For now, return pro as default
        return "elder"

    def _get_price_id(self, tier: str) -> str:
        """Get Stripe price ID for a tier."""
        # In production, this would map to actual Stripe price IDs
        price_map = {
            "hatchling": "price_hatchling_monthly",
            "elder": "price_elder_monthly",
            "hero": "price_hero_monthly",
        }
        return price_map.get(tier, "price_elder_monthly")

    def _create_subscription(self, customer_id: str, tier: str) -> Any:
        """Create a new subscription for a customer."""
        price_id = self._get_price_id(tier)
        return self._stripe.Subscription.create(
            customer=customer_id,
            items=[{"price": price_id}],
        )

    def _create_free_subscription(self, owner_id: str) -> SubscriptionRecord:
        """Create a free tier subscription record."""
        now = datetime.now(timezone.utc)
        tier = self.TIERS["free"]

        return SubscriptionRecord(
            record_id=f"sub-free-{owner_id}",
            owner_id=owner_id,
            tier="free",
            status="active",
            usage=UsageMetrics(
                kin_count=0,
                kin_limit=tier["kin_limit"],
                api_calls_current=0,
                api_calls_limit=tier["api_calls_limit"],
                storage_used_mb=0.0,
                storage_limit_mb=tier["storage_limit_mb"],
                voice_minutes_current=0.0,
                voice_minutes_limit=tier["voice_minutes_limit"],
            ),
            billing_cycle=BillingCycle(
                interval="month",
                current_period_start=now,
                current_period_end=now,
                amount=0,
            ),
            renewal_date=now,
            created_at=now,
            updated_at=now,
            features=tier["features"],
        )

    def _stripe_to_subscription_record(self, customer_id: str, sub: Any) -> SubscriptionRecord:
        """Convert Stripe subscription to SubscriptionRecord."""
        tier = self._get_tier_from_subscription(sub)
        tier_config = self.TIERS[tier]

        return SubscriptionRecord(
            record_id=f"sub-{sub.id}",
            owner_id=customer_id,
            stripe_customer_id=customer_id,
            stripe_subscription_id=sub.id,
            tier=tier,
            status=sub.status,
            usage=self.get_usage(sub.id),
            billing_cycle=BillingCycle(
                interval="month",  # Would extract from subscription
                current_period_start=datetime.fromtimestamp(sub.current_period_start, tz=timezone.utc),
                current_period_end=datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc),
                amount=tier_config["price"],
            ),
            renewal_date=datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc),
            trial_end=datetime.fromtimestamp(sub.trial_end, tz=timezone.utc) if sub.trial_end else None,
            cancel_at_period_end=sub.cancel_at_period_end,
            canceled_at=datetime.fromtimestamp(sub.canceled_at, tz=timezone.utc) if sub.canceled_at else None,
            created_at=datetime.fromtimestamp(sub.created, tz=timezone.utc),
            updated_at=datetime.now(timezone.utc),
            features=tier_config["features"],
        )

    # --- Mock data methods ---

    def _get_mock_subscription(self, customer_id: str) -> SubscriptionRecord:
        """Return mock subscription data for development."""
        now = datetime.now(timezone.utc)
        tier = self.TIERS["elder"]

        return SubscriptionRecord(
            record_id=f"sub-mock-{customer_id}",
            owner_id=customer_id.replace("cus_", "owner-"),
            stripe_customer_id=customer_id,
            stripe_subscription_id="sub_mock123456",
            tier="elder",
            status="active",
            usage=UsageMetrics(
                kin_count=3,
                kin_limit=tier["kin_limit"],
                api_calls_current=45230,
                api_calls_limit=tier["api_calls_limit"],
                storage_used_mb=128.5,
                storage_limit_mb=tier["storage_limit_mb"],
                voice_minutes_current=45.2,
                voice_minutes_limit=tier["voice_minutes_limit"],
            ),
            billing_cycle=BillingCycle(
                interval="month",
                current_period_start=datetime(2026, 3, 1, tzinfo=timezone.utc),
                current_period_end=datetime(2026, 4, 1, tzinfo=timezone.utc),
                amount=tier["price"],
            ),
            renewal_date=datetime(2026, 4, 1, tzinfo=timezone.utc),
            payment_method=PaymentMethod(
                type="card",
                last_four="4242",
                brand="visa",
                expiry_month=12,
                expiry_year=2027,
            ),
            created_at=datetime(2025, 6, 15, tzinfo=timezone.utc),
            updated_at=now,
            features=tier["features"],
        )

    def _get_mock_usage(self) -> UsageMetrics:
        """Return mock usage data."""
        tier = self.TIERS["elder"]
        return UsageMetrics(
            kin_count=3,
            kin_limit=tier["kin_limit"],
            api_calls_current=45230,
            api_calls_limit=tier["api_calls_limit"],
            storage_used_mb=128.5,
            storage_limit_mb=tier["storage_limit_mb"],
            voice_minutes_current=45.2,
            voice_minutes_limit=tier["voice_minutes_limit"],
        )

    def _get_mock_invoices(self, customer_id: str, limit: int) -> list[Invoice]:
        """Return mock invoice history."""
        now = datetime.now(timezone.utc)
        return [
            Invoice(
                invoice_id="in_mock001",
                number="INV-2026-003",
                amount=2900,
                currency="usd",
                status="paid",
                created_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
                paid_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
                invoice_url="https://invoice.stripe.com/mock001",
                invoice_pdf="https://invoice.stripe.com/mock001.pdf",
            ),
            Invoice(
                invoice_id="in_mock002",
                number="INV-2026-002",
                amount=2900,
                currency="usd",
                status="paid",
                created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
                paid_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
                invoice_url="https://invoice.stripe.com/mock002",
                invoice_pdf="https://invoice.stripe.com/mock002.pdf",
            ),
            Invoice(
                invoice_id="in_mock003",
                number="INV-2026-001",
                amount=2900,
                currency="usd",
                status="paid",
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                paid_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                invoice_url="https://invoice.stripe.com/mock003",
                invoice_pdf="https://invoice.stripe.com/mock003.pdf",
            ),
        ]
