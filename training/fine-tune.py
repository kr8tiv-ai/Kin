#!/usr/bin/env python3
"""
Unsloth QLoRA Fine-Tuning Script for Companion Models

Reads curated JSONL (SFTLine format), fine-tunes Llama 3.2 1B/3B via
Unsloth QLoRA 4-bit quantization, and exports merged GGUF for Ollama.

Usage:
    python training/fine-tune.py \
        --companion-id cipher \
        --data-path data/training/cipher/training.jsonl \
        --dry-run

    python training/fine-tune.py \
        --companion-id cipher \
        --data-path data/training/cipher/training.jsonl \
        --base-model unsloth/Llama-3.2-3B-Instruct-bnb-4bit \
        --epochs 2

Environment:
    HF_TOKEN - HuggingFace token for gated model access (Llama 3.2 requires
               Meta license acceptance at https://huggingface.co/meta-llama)

Observability:
    All progress messages use [fine-tune] prefix for grep-ability.
    Exits non-zero with specific error messages for: insufficient VRAM,
    no CUDA, empty dataset (<5 entries), malformed JSONL.
"""

import argparse
import json
import re
import os
import subprocess
import sys
from pathlib import Path

# ============================================================================
# Constants
# ============================================================================

MIN_VALID_ENTRIES = 5
MAX_SAFE_EPOCHS = 3
VRAM_MIN_1B_MB = 3500
VRAM_MIN_3B_MB = 7000

# ============================================================================
# Logging
# ============================================================================

def log(msg: str) -> None:
    """Print a structured log message with [fine-tune] prefix."""
    print(f"[fine-tune] {msg}", flush=True)


def warn(msg: str) -> None:
    """Print a warning to stderr with [fine-tune] prefix."""
    print(f"[fine-tune] WARNING: {msg}", file=sys.stderr, flush=True)


def fatal(msg: str) -> None:
    """Print an error and exit non-zero."""
    print(f"[fine-tune] ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)

# ============================================================================
# CLI
# ============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fine-tune Llama 3.2 via Unsloth QLoRA for companion models",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--companion-id",
        required=True,
        help="Companion identifier (e.g., cipher, vex, nova)",
    )
    parser.add_argument(
        "--data-path",
        required=True,
        help="Path to curated JSONL file (SFTLine format)",
    )
    parser.add_argument(
        "--base-model",
        default="unsloth/Llama-3.2-1B-Instruct-bnb-4bit",
        help="Unsloth model identifier (default: %(default)s)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output directory for GGUF (default: training/output/{companion_id})",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=2,
        help="Number of training epochs (default: %(default)s, max recommended: 3)",
    )
    parser.add_argument(
        "--max-seq-length",
        type=int,
        default=1024,
        help="Maximum sequence length for training (default: %(default)s)",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=2e-4,
        help="Learning rate (default: %(default)s)",
    )
    parser.add_argument(
        "--min-assistant-chars",
        type=int,
        default=0,
        help="Minimum average assistant completion length required (default: %(default)s)",
    )
    parser.add_argument(
        "--max-duplicate-ratio",
        type=float,
        default=1.0,
        help="Maximum allowed normalized duplicate structure ratio [0..1] (default: %(default)s)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate data and print stats without loading ML libraries or GPU",
    )
    parser.add_argument(
        "--skip-gguf-export",
        action="store_true",
        help="Write merged 16-bit model files only and skip GGUF export",
    )
    return parser.parse_args()

# ============================================================================
# JSONL Loading
# ============================================================================

REQUIRED_ROLES = {"system", "user", "assistant"}


def load_jsonl(data_path: str) -> list[dict]:
    """
    Load and validate curated JSONL training data.

    Each line must be a JSON object with a 'messages' array containing
    system, user, and assistant messages. The 'metadata' field is stripped.

    Returns a list of dicts, each with a 'messages' key containing the
    validated message array.

    Exits non-zero if:
    - File does not exist or is empty
    - Fewer than MIN_VALID_ENTRIES valid entries after filtering
    """
    path = Path(data_path)

    if not path.exists():
        fatal(f"Data file not found: {data_path}")

    if path.stat().st_size == 0:
        fatal(f"Data file is empty: {data_path}")

    log("Loading data...")

    entries: list[dict] = []
    skipped = 0

    with open(path, "r", encoding="utf-8") as f:
        for line_num, raw_line in enumerate(f, start=1):
            raw_line = raw_line.strip()
            if not raw_line:
                continue

            # Parse JSON
            try:
                parsed = json.loads(raw_line)
            except json.JSONDecodeError as e:
                warn(f"Invalid JSON at line {line_num}: {e}")
                skipped += 1
                continue

            # Validate messages array exists
            messages = parsed.get("messages")
            if not isinstance(messages, list):
                warn(f"Missing or invalid 'messages' array at line {line_num}")
                skipped += 1
                continue

            # Validate required roles are present
            roles_present = {msg.get("role") for msg in messages if isinstance(msg, dict)}
            missing_roles = REQUIRED_ROLES - roles_present
            if missing_roles:
                warn(f"Missing roles {missing_roles} at line {line_num}")
                skipped += 1
                continue

            # Validate all messages have content
            valid = True
            for msg in messages:
                if not isinstance(msg, dict):
                    valid = False
                    break
                if not msg.get("content"):
                    valid = False
                    break
                if msg.get("role") not in ("system", "user", "assistant"):
                    valid = False
                    break
            if not valid:
                warn(f"Malformed message structure at line {line_num}")
                skipped += 1
                continue

            # Strip metadata - keep only messages for training
            entries.append({"messages": messages})

    if skipped > 0:
        warn(f"Skipped {skipped} malformed line(s)")

    if len(entries) < MIN_VALID_ENTRIES:
        fatal(
            f"Insufficient valid entries: {len(entries)} "
            f"(minimum {MIN_VALID_ENTRIES} required). "
            f"Curate more training data before fine-tuning."
        )

    log(f"{len(entries)} entries loaded")
    return entries

# ============================================================================
# Data Stats (dry-run)
# ============================================================================

def print_data_stats(entries: list[dict]) -> None:
    """Print dataset statistics for dry-run validation."""
    total_chars = 0
    max_chars = 0
    total_messages = 0

    for entry in entries:
        entry_chars = 0
        for msg in entry["messages"]:
            char_count = len(msg["content"])
            entry_chars += char_count
            total_messages += 1
        total_chars += entry_chars
        max_chars = max(max_chars, entry_chars)

    avg_chars = total_chars // len(entries) if entries else 0

    log(f"Dataset stats:")
    log(f"  Total entries:       {len(entries)}")
    log(f"  Total messages:      {total_messages}")
    log(f"  Avg chars/entry:     {avg_chars}")
    log(f"  Max chars/entry:     {max_chars}")
    log(f"  Total chars:         {total_chars}")



def _assistant_text(entry: dict) -> str:
    for msg in entry.get("messages", []):
        if msg.get("role") == "assistant":
            return str(msg.get("content", ""))
    return ""


def _normalize_structure(text: str) -> str:
    normalized = text.lower()
    normalized = re.sub(r"https?://\S+", "<url>", normalized)
    normalized = re.sub(r"#[0-9a-f]{3,8}\b", "<hex>", normalized)
    normalized = re.sub(r"\b\d+(?:\.\d+)?\b", "<num>", normalized)
    normalized = re.sub(r"picsum\.photos/[^\s'\"<>)]+", "picsum.photos/<img>", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _html_like_ratio(texts: list[str]) -> tuple[int, float]:
    hits = 0
    for text in texts:
        lower = text.lower()
        if (
            "<!doctype html" in lower
            or "<html" in lower
            or ("<body" in lower and "<style" in lower)
        ):
            hits += 1
    total = max(len(texts), 1)
    return hits, hits / total


def validate_dataset_quality(
    entries: list[dict],
    companion_id: str,
    min_assistant_chars: int,
    max_duplicate_ratio: float,
) -> None:
    assistant_texts = [_assistant_text(entry) for entry in entries]
    assistant_texts = [t for t in assistant_texts if t]

    if not assistant_texts:
        fatal("No assistant messages found after parsing training entries")

    lengths = [len(t) for t in assistant_texts]
    avg_len = int(sum(lengths) / len(lengths))
    min_len = min(lengths)
    max_len = max(lengths)

    log("Assistant completion stats:")
    log(f"  Entries:             {len(assistant_texts)}")
    log(f"  Avg chars:           {avg_len}")
    log(f"  Min/Max chars:       {min_len}/{max_len}")

    if min_assistant_chars > 0 and avg_len < min_assistant_chars:
        fatal(
            f"Average assistant completion is too short ({avg_len} chars). "
            f"Required minimum is {min_assistant_chars}."
        )

    normalized = [_normalize_structure(t) for t in assistant_texts]
    unique_structures = len(set(normalized))
    duplicate_ratio = 1.0 - (unique_structures / len(normalized))
    log(f"  Duplicate ratio:     {duplicate_ratio:.3f}")

    if max_duplicate_ratio < 1.0 and duplicate_ratio > max_duplicate_ratio:
        fatal(
            f"Dataset appears template-collapsed (duplicate ratio {duplicate_ratio:.3f} > {max_duplicate_ratio:.3f}). "
            "Curate more structurally diverse completions before training."
        )

    html_hits, html_ratio = _html_like_ratio(assistant_texts)
    log(f"  HTML-like entries:    {html_hits}/{len(assistant_texts)}")

    if html_ratio < 0.50:
        log(
            f"  HTML guardrails:      skipped for {companion_id} "
            "(dataset looks like conversational SFT, not site generation)"
        )
        return

    lower = [t.lower() for t in assistant_texts]
    tailwind_hits = sum(("tailwindcss" in t or "cdn.tailwindcss" in t) for t in lower)
    lenis_stop_hits = sum("lenis.stop(" in t for t in lower)
    doctype_hits = sum("<!doctype html" in t for t in lower)
    head_signatures = {re.sub(r"\s+", " ", t[:220].strip()) for t in lower}
    head_diversity = len(head_signatures) / max(len(lower), 1)

    log(f"  HTML doctype ratio:   {doctype_hits}/{len(lower)}")
    log(f"  HTML head diversity:  {head_diversity:.3f}")

    if tailwind_hits > 0:
        fatal(f"HTML dataset contains Tailwind patterns in {tailwind_hits} entries (must be zero).")
    if lenis_stop_hits > 0:
        fatal(f"HTML dataset contains lenis.stop() in {lenis_stop_hits} entries (must be zero).")
    if head_diversity < 0.40:
        message = (
            f"HTML dataset has low structural diversity ({head_diversity:.3f} < 0.400). "
            "This will likely memorize one template."
        )
        if max_duplicate_ratio < 1.0:
            fatal(message)
        warn(message)

# ============================================================================
# VRAM Check
# ============================================================================

def check_vram(base_model: str) -> int:
    """
    Check available GPU VRAM via nvidia-smi.

    Returns total VRAM in MB.
    Exits non-zero if VRAM is insufficient for the selected model size.
    """
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except FileNotFoundError:
        fatal(
            "nvidia-smi not found. CUDA toolkit may not be installed. "
            "Install NVIDIA drivers and CUDA toolkit, or use --dry-run to validate data without GPU."
        )
    except subprocess.TimeoutExpired:
        fatal("nvidia-smi timed out - GPU may be in a bad state.")

    if result.returncode != 0:
        fatal(f"nvidia-smi failed (exit {result.returncode}): {result.stderr.strip()}")

    # Parse first GPU's total memory
    lines = result.stdout.strip().split("\n")
    if not lines or not lines[0].strip():
        fatal("nvidia-smi returned no GPU information")

    try:
        vram_mb = int(lines[0].strip())
    except ValueError:
        fatal(f"Could not parse VRAM from nvidia-smi output: '{lines[0].strip()}'")

    log(f"VRAM check: {vram_mb} MB available")

    # Determine minimum VRAM based on model size
    is_3b = "3B" in base_model or "3b" in base_model
    min_vram = VRAM_MIN_3B_MB if is_3b else VRAM_MIN_1B_MB
    model_label = "3B" if is_3b else "1B"

    if vram_mb < min_vram:
        fatal(
            f"Insufficient VRAM for {model_label} model: {vram_mb} MB available, "
            f"{min_vram} MB required. Use a smaller model or upgrade GPU."
        )

    return vram_mb

# ============================================================================
# HuggingFace Auth Check
# ============================================================================

def check_hf_auth() -> None:
    """
    Check if HuggingFace authentication is available.
    Prints a warning if not available - Llama 3.2 requires Meta license acceptance.
    """
    # Check env var first
    if os.environ.get("HF_TOKEN"):
        log("HuggingFace auth: HF_TOKEN environment variable set")
        return

    # Check huggingface-cli login state
    try:
        result = subprocess.run(
            ["huggingface-cli", "whoami"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            username = result.stdout.strip().split("\n")[0]
            log(f"HuggingFace auth: logged in as {username}")
            return
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    warn(
        "No HuggingFace authentication detected. "
        "Llama 3.2 requires Meta license acceptance at "
        "https://huggingface.co/meta-llama. "
        "Set HF_TOKEN env var or run: huggingface-cli login"
    )

# ============================================================================
# Training
# ============================================================================

def run_training(
    entries: list[dict],
    base_model: str,
    output_dir: str,
    epochs: int,
    max_seq_length: int,
    learning_rate: float,
    skip_gguf_export: bool,
) -> None:
    """
    Run QLoRA fine-tuning via Unsloth and export merged GGUF.

    This function imports ML libraries only when called (not at module level)
    so that --dry-run works without GPU or ML dependencies.
    """
    # Lazy imports - only load heavy ML libraries when actually training
    try:
        from unsloth import FastLanguageModel
        from unsloth.chat_templates import get_chat_template
    except ImportError:
        fatal(
            "Unsloth is not installed. "
            "Install dependencies: pip install -r training/requirements.txt"
        )

    try:
        from trl import SFTTrainer, SFTConfig
    except ImportError:
        fatal(
            "TRL is not installed. "
            "Install dependencies: pip install -r training/requirements.txt"
        )

    try:
        from datasets import Dataset
    except ImportError:
        fatal(
            "datasets library is not installed. "
            "Install dependencies: pip install -r training/requirements.txt"
        )

    # Warn on high epoch count
    if epochs > MAX_SAFE_EPOCHS:
        warn(
            f"Epoch count {epochs} exceeds recommended maximum of {MAX_SAFE_EPOCHS}. "
            f"High epoch counts risk catastrophic forgetting. Consider reducing."
        )

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Load model
    log(f"Loading base model: {base_model}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=max_seq_length,
        load_in_4bit=True,
    )

    # Configure LoRA
    log("Configuring LoRA adapters...")
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=3407,
    )

    # Apply chat template
    tokenizer = get_chat_template(
        tokenizer,
        chat_template="llama-3.1",
    )

    # Prepare dataset
    log("Preparing dataset...")

    def format_conversation(example: dict) -> dict:
        """Apply chat template to format messages into a single text string."""
        text = tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )
        return {"text": text}

    dataset = Dataset.from_list(entries)
    dataset = dataset.map(format_conversation)

    # Configure training
    log("Training...")
    training_args = SFTConfig(
        output_dir=output_dir,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        learning_rate=learning_rate,
        num_train_epochs=epochs,
        max_seq_length=max_seq_length,
        dataset_text_field="text",
        logging_steps=1,
        save_steps=0,
        weight_decay=0.01,
        lr_scheduler_type="linear",
        optim="adamw_8bit",
        seed=3407,
        bf16=True,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=training_args,
    )

    # Train
    trainer.train()
    log("Training complete")

    log("Merging model weights to 16-bit format...")
    model.save_pretrained_merged(
        output_dir,
        tokenizer,
        save_method="merged_16bit",
    )
    log(f"Merged model saved to {output_dir}")

    if skip_gguf_export:
        log("Skipping GGUF export (--skip-gguf-export)")
        return

    log(f"Exporting GGUF to {output_dir}")
    model.save_pretrained_gguf(
        output_dir,
        tokenizer,
        quantization_method="q4_k_m",
    )
    log(f"GGUF exported to {output_dir}")

# ============================================================================
# Main
# ============================================================================

def main() -> None:
    args = parse_args()

    # Resolve output directory
    output_dir = args.output_dir or os.path.join("training", "output", args.companion_id)

    # Load and validate data
    entries = load_jsonl(args.data_path)

    # Dataset quality guardrails (prevents template collapse)
    validate_dataset_quality(
        entries=entries,
        companion_id=args.companion_id,
        min_assistant_chars=args.min_assistant_chars,
        max_duplicate_ratio=args.max_duplicate_ratio,
    )

    # Dry-run: print stats and exit
    if args.dry_run:
        print_data_stats(entries)
        log("Dry run complete - data is valid")
        sys.exit(0)

    # VRAM check
    check_vram(args.base_model)

    # HuggingFace auth check
    check_hf_auth()

    # Run training
    run_training(
        entries=entries,
        base_model=args.base_model,
        output_dir=output_dir,
        epochs=args.epochs,
        max_seq_length=args.max_seq_length,
        learning_rate=args.learning_rate,
        skip_gguf_export=args.skip_gguf_export,
    )

    log("Done.")


if __name__ == "__main__":
    main()

