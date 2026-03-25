"""
Tests for SolanaClient class.
"""

import pytest
from datetime import datetime, timezone

from runtime_types.solana_client import (
    SolanaClient,
    NFTRecord,
    NFTMetadata,
    CreatorInfo,
    create_genesis_six_nfts,
)


@pytest.fixture
def client() -> SolanaClient:
    """Create a fresh SolanaClient instance for testing."""
    return SolanaClient(
        rpc_url="https://api.devnet.solana.com",
        chain="devnet",
    )


@pytest.fixture
def owner_wallet() -> str:
    """Mock owner wallet address."""
    return "TestWallet123456789ABCDEFGHabcdefghij"


class TestSolanaClientInit:
    """Test SolanaClient initialization."""

    def test_init_devnet(self):
        """Client initializes with devnet configuration."""
        client = SolanaClient(chain="devnet")
        assert client.chain == "devnet"
        assert "devnet" in client.rpc_url

    def test_init_mainnet(self):
        """Client initializes with mainnet configuration."""
        client = SolanaClient(
            rpc_url="https://api.mainnet-beta.solana.com",
            chain="mainnet-beta",
        )
        assert client.chain == "mainnet-beta"


class TestMintNFT:
    """Test NFT minting."""

    def test_mint_nft_creates_record(self, client, owner_wallet):
        """Minting creates an NFT record."""
        record = client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        assert record.kin_id == "cipher-001"
        assert record.kin_name == "Cipher"
        assert record.owner_wallet == owner_wallet
        assert record.verification_status == "verified"
        assert record.mint_address is not None

    def test_mint_nft_generates_mint_address(self, client, owner_wallet):
        """Minting generates a unique mint address."""
        record1 = client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        record2 = client.mint_nft(
            kin_id="mischief-001",
            kin_name="Mischief",
            glb_url="https://assets.kr8tiv.ai/kin/mischief.glb",
            owner_wallet=owner_wallet,
        )

        assert record1.mint_address != record2.mint_address

    def test_mint_nft_with_custom_metadata(self, client, owner_wallet):
        """Minting with custom metadata."""
        metadata = NFTMetadata(
            name="Custom Kin NFT",
            symbol="CKIN",
            uri="https://custom.uri/metadata.json",
            properties={"custom": "value"},
        )

        record = client.mint_nft(
            kin_id="test-001",
            kin_name="Test",
            glb_url="https://assets.kr8tiv.ai/kin/test.glb",
            owner_wallet=owner_wallet,
            metadata=metadata,
        )

        assert record.metadata["name"] == "Custom Kin NFT"
        assert record.metadata["symbol"] == "CKIN"
        assert record.metadata["properties"]["custom"] == "value"

    def test_mint_nft_generates_explorer_url(self, client, owner_wallet):
        """Minting generates Solana explorer URL."""
        record = client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        assert "explorer.solana.com" in record.explorer_url
        assert record.mint_address in record.explorer_url
        assert "cluster=devnet" in record.explorer_url


class TestVerifyOwnership:
    """Test ownership verification."""

    def test_verify_ownership_true(self, client, owner_wallet):
        """Verification succeeds for correct owner."""
        client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        is_owner = client.verify_ownership("cipher-001", owner_wallet)
        assert is_owner is True

    def test_verify_ownership_false(self, client, owner_wallet):
        """Verification fails for incorrect owner."""
        client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        is_owner = client.verify_ownership("cipher-001", "WrongWallet123")
        assert is_owner is False

    def test_verify_ownership_missing_nft(self, client):
        """Verification fails for non-existent NFT."""
        is_owner = client.verify_ownership("unknown-001", owner_wallet)
        assert is_owner is False


class TestGetNFTRecord:
    """Test NFT record retrieval."""

    def test_get_nft_record_exists(self, client, owner_wallet):
        """Get existing NFT record."""
        client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        record = client.get_nft_record("cipher-001")
        assert record is not None
        assert record.kin_id == "cipher-001"

    def test_get_nft_record_missing(self, client):
        """Get non-existent NFT record returns None."""
        record = client.get_nft_record("unknown-001")
        assert record is None


class TestGetGlbUrl:
    """Test GLB URL retrieval."""

    def test_get_glb_url_by_kin_id(self, client, owner_wallet):
        """Get GLB URL for a Kin."""
        client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        record = client.get_nft_record("cipher-001")
        assert record.glb_url == "https://assets.kr8tiv.ai/kin/cipher.glb"


class TestTransferNFT:
    """Test NFT transfer."""

    def test_transfer_nft_success(self, client, owner_wallet):
        """Transfer NFT to new wallet."""
        client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )

        new_wallet = "NewWallet987654321ABCDEFGHabcdefghij"
        success = client.transfer_nft("cipher-001", new_wallet)

        assert success is True

        record = client.get_nft_record("cipher-001")
        assert record.owner_wallet == new_wallet
        assert record.transfer_count == 1
        assert record.last_transfer_at is not None

    def test_transfer_nft_missing(self, client):
        """Transfer non-existent NFT fails."""
        success = client.transfer_nft("unknown-001", "NewWallet")
        assert success is False


class TestGetAllNFTRecords:
    """Test getting all NFT records."""

    def test_get_all_records_empty(self, client):
        """Get all records when empty."""
        records = client.get_all_nft_records()
        assert records == []

    def test_get_all_records_multiple(self, client, owner_wallet):
        """Get all records with multiple NFTs."""
        client.mint_nft(
            kin_id="cipher-001",
            kin_name="Cipher",
            glb_url="https://assets.kr8tiv.ai/kin/cipher.glb",
            owner_wallet=owner_wallet,
        )
        client.mint_nft(
            kin_id="mischief-001",
            kin_name="Mischief",
            glb_url="https://assets.kr8tiv.ai/kin/mischief.glb",
            owner_wallet=owner_wallet,
        )

        records = client.get_all_nft_records()
        assert len(records) == 2


class TestCreateGenesisSixNFTs:
    """Test Genesis Six NFT creation."""

    def test_create_genesis_six_creates_all(self, client, owner_wallet):
        """Creating Genesis Six creates all 6 NFTs."""
        records = create_genesis_six_nfts(client, owner_wallet)

        assert len(records) == 6

        kin_ids = {r.kin_id for r in records}
        assert "cipher-001" in kin_ids
        assert "mischief-001" in kin_ids
        assert "vortex-001" in kin_ids
        assert "forge-001" in kin_ids
        assert "aether-001" in kin_ids
        assert "catalyst-001" in kin_ids

    def test_create_genesis_six_metadata(self, client, owner_wallet):
        """Genesis Six NFTs have correct metadata."""
        records = create_genesis_six_nfts(client, owner_wallet)

        cipher = next(r for r in records if r.kin_id == "cipher-001")
        assert "Code Kraken" in cipher.metadata.get("properties", {}).get("bloodline", "")


class TestNFTRecord:
    """Test NFTRecord dataclass."""

    def test_to_dict(self, owner_wallet):
        """NFTRecord converts to dictionary."""
        now = datetime.now(timezone.utc)
        record = NFTRecord(
            record_id="nft-record-test001",
            kin_id="test-001",
            kin_name="Test",
            mint_address="TestMintAddress123456789ABCDEFGH",
            glb_url="https://assets.kr8tiv.ai/kin/test.glb",
            owner_wallet=owner_wallet,
            chain="devnet",
            minted_at=now,
            verification_status="verified",
        )

        data = record.to_dict()

        assert data["kin_id"] == "test-001"
        assert data["chain"] == "devnet"
        assert data["schema_family"] == "nft_record"


class TestNFTMetadata:
    """Test NFTMetadata dataclass."""

    def test_to_dict(self):
        """NFTMetadata converts to dictionary."""
        metadata = NFTMetadata(
            name="Test NFT",
            symbol="TEST",
            uri="https://test.uri/metadata.json",
            sellers_fee_basis_points=500,
            creators=[CreatorInfo(address="TestCreator123", share=100)],
            properties={"key": "value"},
        )

        data = metadata.to_dict()

        assert data["name"] == "Test NFT"
        assert data["symbol"] == "TEST"
        assert len(data["creators"]) == 1
        assert data["creators"][0]["address"] == "TestCreator123"
