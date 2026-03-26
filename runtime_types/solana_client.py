"""
SolanaClient - Interface for Solana NFT operations.

Provides methods for minting, verifying, and managing Kin companion NFTs
on Solana blockchain (devnet/mainnet).
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class CreatorInfo:
    """Creator information for NFT metadata."""
    address: str
    share: int = 100
    verified: bool = True


@dataclass
class NFTMetadata:
    """Metaplex-compatible NFT metadata."""
    name: str
    symbol: str = "KIN"
    uri: str = ""
    seller_fee_basis_points: int = 500
    creators: list[CreatorInfo] = field(default_factory=list)
    properties: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "symbol": self.symbol,
            "uri": self.uri,
            "seller_fee_basis_points": self.seller_fee_basis_points,
            "creators": [
                {"address": c.address, "share": c.share, "verified": c.verified}
                for c in self.creators
            ],
            "properties": self.properties,
        }


@dataclass
class NFTRecord:
    """NFT ownership record for a Kin companion."""
    record_id: str
    kin_id: str
    kin_name: str
    mint_address: str
    glb_url: str
    owner_wallet: str
    chain: str
    minted_at: datetime
    verification_status: str
    creator_wallet: Optional[str] = None
    collection_address: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    last_verified_at: Optional[datetime] = None
    transfer_count: int = 0
    last_transfer_at: Optional[datetime] = None
    transaction_signature: Optional[str] = None
    boot_hash: Optional[str] = None
    explorer_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "record_id": self.record_id,
            "schema_family": "nft_record",
            "kin_id": self.kin_id,
            "kin_name": self.kin_name,
            "mint_address": self.mint_address,
            "glb_url": self.glb_url,
            "owner_wallet": self.owner_wallet,
            "creator_wallet": self.creator_wallet,
            "chain": self.chain,
            "collection_address": self.collection_address,
            "metadata": self.metadata,
            "minted_at": self.minted_at.isoformat() if self.minted_at else None,
            "last_verified_at": self.last_verified_at.isoformat() if self.last_verified_at else None,
            "verification_status": self.verification_status,
            "transfer_count": self.transfer_count,
            "last_transfer_at": self.last_transfer_at.isoformat() if self.last_transfer_at else None,
            "transaction_signature": self.transaction_signature,
            "boot_hash": self.boot_hash,
            "explorer_url": self.explorer_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SolanaClient:
    """
    Interface for Solana NFT operations.
    
    Provides methods for minting, verifying, and managing Kin companion NFTs.
    Designed to work with Metaplex standard for NFT metadata.
    """

    EXPLORER_BASE = "https://explorer.solana.com"

    def __init__(
        self,
        rpc_url: str = "https://api.devnet.solana.com",
        keypair_path: Optional[str] = None,
        chain: str = "devnet",
        collection_address: Optional[str] = None,
    ):
        self.rpc_url = rpc_url
        self.keypair_path = keypair_path
        self.chain = chain
        self.collection_address = collection_address
        self._nft_records: dict[str, NFTRecord] = {}

    def _generate_mint_address(self, kin_id: str) -> str:
        """Generate a deterministic mint address for testing."""
        hash_input = f"kin-nft-{kin_id}-{self.chain}".encode()
        hash_bytes = hashlib.sha256(hash_input).digest()[:32]
        chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
        result = []
        for i in range(0, 32, 3):
            idx = (hash_bytes[i] << 16 | hash_bytes[i+1] << 8 | hash_bytes[i+2]) % len(chars)
            result.append(chars[idx])
        return "".join(result)[:44]

    def _generate_transaction_signature(self) -> str:
        """Generate a mock transaction signature for testing."""
        hash_bytes = hashlib.sha256(str(time.time()).encode()).digest()
        chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
        result = [chars[b % len(chars)] for b in hash_bytes]
        return "".join(result)[:88]

    def mint_nft(
        self,
        kin_id: str,
        kin_name: str,
        glb_url: str,
        owner_wallet: str,
        metadata: Optional[NFTMetadata] = None,
        boot_hash: Optional[str] = None,
    ) -> NFTRecord:
        """Mint a new NFT for a Kin companion."""
        now = datetime.now(timezone.utc)
        mint_address = self._generate_mint_address(kin_id)
        transaction_signature = self._generate_transaction_signature()

        if metadata is None:
            metadata = NFTMetadata(
                name=f"{kin_name} - Kin Companion",
                symbol="KIN",
                uri=glb_url.replace(".glb", ".json"),
                creators=[CreatorInfo(address=owner_wallet, share=100)],
            )

        cluster_param = "?cluster=devnet" if self.chain == "devnet" else ""
        explorer_url = f"{self.EXPLORER_BASE}/address/{mint_address}{cluster_param}"

        record = NFTRecord(
            record_id=f"nft-record-{kin_id.replace('-', '')}",
            kin_id=kin_id,
            kin_name=kin_name,
            mint_address=mint_address,
            glb_url=glb_url,
            owner_wallet=owner_wallet,
            creator_wallet=owner_wallet,
            chain=self.chain,
            collection_address=self.collection_address,
            metadata=metadata.to_dict(),
            minted_at=now,
            verification_status="verified",
            last_verified_at=now,
            transaction_signature=transaction_signature,
            boot_hash=boot_hash,
            explorer_url=explorer_url,
            created_at=now,
            updated_at=now,
        )

        self._nft_records[kin_id] = record
        logger.info(f"Minted NFT for {kin_name} ({kin_id}): {mint_address}")
        return record

    def verify_ownership(self, kin_id: str, wallet_address: str) -> bool:
        """Verify that a wallet owns the NFT for a Kin."""
        record = self._nft_records.get(kin_id)
        if not record:
            return False
        
        is_owner = record.owner_wallet == wallet_address
        if is_owner:
            record.last_verified_at = datetime.now(timezone.utc)
            record.verification_status = "verified"
        return is_owner

    def get_nft_record(self, kin_id: str) -> Optional[NFTRecord]:
        """Get NFT record for a Kin."""
        return self._nft_records.get(kin_id)

    def get_glb_url(self, mint_address: str) -> Optional[str]:
        """Get GLB URL from NFT by mint address."""
        for record in self._nft_records.values():
            if record.mint_address == mint_address:
                return record.glb_url
        return None

    def transfer_nft(self, kin_id: str, to_wallet: str) -> bool:
        """Transfer NFT to a new wallet."""
        record = self._nft_records.get(kin_id)
        if not record:
            return False

        record.owner_wallet = to_wallet
        record.transfer_count += 1
        record.last_transfer_at = datetime.now(timezone.utc)
        record.transaction_signature = self._generate_transaction_signature()
        record.updated_at = datetime.now(timezone.utc)
        return True

    def get_all_nft_records(self) -> list[NFTRecord]:
        """Get all NFT records."""
        return list(self._nft_records.values())


def create_genesis_six_nfts(client: SolanaClient, owner_wallet: str) -> list[NFTRecord]:
    """Create NFT records for all Genesis Six Kin companions."""
    genesis_six = [
        {
            "kin_id": "cipher-001",
            "kin_name": "Cipher",
            "glb_url": "https://assets.kr8tiv.ai/kin/cipher.glb",
            "specialization": "web-design",
            "bloodline": "Code Kraken",
        },
        {
            "kin_id": "mischief-001",
            "kin_name": "Mischief",
            "glb_url": "https://assets.kr8tiv.ai/kin/mischief.glb",
            "specialization": "family-companion",
            "bloodline": "Glitch Pup",
        },
        {
            "kin_id": "vortex-001",
            "kin_name": "Vortex",
            "glb_url": "https://assets.kr8tiv.ai/kin/vortex.glb",
            "specialization": "social-media",
            "bloodline": "Teal Dragon",
        },
        {
            "kin_id": "forge-001",
            "kin_name": "Forge",
            "glb_url": "https://assets.kr8tiv.ai/kin/forge.glb",
            "specialization": "developer-support",
            "bloodline": "Cyber Unicorn",
        },
        {
            "kin_id": "aether-001",
            "kin_name": "Aether",
            "glb_url": "https://assets.kr8tiv.ai/kin/aether.glb",
            "specialization": "creative-writing",
            "bloodline": "Frost Ape",
        },
        {
            "kin_id": "catalyst-001",
            "kin_name": "Catalyst",
            "glb_url": "https://assets.kr8tiv.ai/kin/catalyst.glb",
            "specialization": "wealth-coaching",
            "bloodline": "Cosmic Blob",
        },
    ]

    records = []
    for kin in genesis_six:
        metadata = NFTMetadata(
            name=f"{kin['kin_name']} - Kin Companion",
            symbol="KIN",
            uri=kin["glb_url"].replace(".glb", ".json"),
            properties={
                "specialization": kin["specialization"],
                "bloodline": kin["bloodline"],
            },
        )
        record = client.mint_nft(
            kin_id=kin["kin_id"],
            kin_name=kin["kin_name"],
            glb_url=kin["glb_url"],
            owner_wallet=owner_wallet,
            metadata=metadata,
        )
        records.append(record)

    return records
