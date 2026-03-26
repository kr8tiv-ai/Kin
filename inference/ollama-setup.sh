#!/bin/bash
#
# Ollama Setup Script for KIN Local LLM Integration
#
# Installs Ollama if not present, pulls recommended models,
# and configures for local inference.
#
# Usage:
#   ./inference/ollama-setup.sh [options]
#
# Options:
#   --model MODEL        Model to pull (default: llama3.2)
#   --no-model           Skip model pull
#   --verify             Verify installation only
#   --start              Start Ollama service after install
#   --port PORT          Ollama port (default: 11434)
#

set -e

# Configuration
DEFAULT_MODEL="llama3.2"
RECOMMENDED_MODELS=("llama3.2" "mistral" "llama3.1" "codellama" "deepseek-coder")
OLLAMA_PORT="${OLLAMA_PORT:-11434}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect operating system
detect_os() {
    case "$(uname -s)" in
        Darwin*)    echo "macos" ;;
        Linux*)     echo "linux" ;;
        CYGWIN*|MINGW*|MSYS*)    echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

# Check if Ollama is installed
check_ollama_installed() {
    if command -v ollama &> /dev/null; then
        return 0
    fi
    return 1
}

# Check if Ollama service is running
check_ollama_running() {
    local url="http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/version"
    if curl -s --connect-timeout 2 "$url" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Get Ollama version
get_ollama_version() {
    if check_ollama_installed; then
        ollama --version 2>/dev/null | head -1 || echo "unknown"
    else
        echo "not installed"
    fi
}

# Install Ollama on macOS
install_ollama_macos() {
    log_info "Installing Ollama on macOS..."
    
    # Check for Homebrew
    if command -v brew &> /dev/null; then
        log_info "Installing via Homebrew..."
        brew install ollama
    else
        log_info "Installing via official script..."
        curl -fsSL https://ollama.com/install.sh | sh
    fi
    
    if check_ollama_installed; then
        log_success "Ollama installed successfully"
        return 0
    else
        log_error "Failed to install Ollama"
        return 1
    fi
}

# Install Ollama on Linux
install_ollama_linux() {
    log_info "Installing Ollama on Linux..."
    curl -fsSL https://ollama.com/install.sh | sh
    
    if check_ollama_installed; then
        log_success "Ollama installed successfully"
        return 0
    else
        log_error "Failed to install Ollama"
        return 1
    fi
}

# Install Ollama on Windows
install_ollama_windows() {
    log_warning "Windows installation requires manual steps."
    echo ""
    echo "  1. Visit: https://ollama.com/download/windows"
    echo "  2. Download and run the installer"
    echo "  3. Re-run this script to verify installation"
    echo ""
    echo "Alternatively, use WSL2 and run this script from within Linux."
    return 1
}

# Start Ollama service
start_ollama_service() {
    log_info "Starting Ollama service on port ${OLLAMA_PORT}..."
    
    if check_ollama_running; then
        log_success "Ollama service already running"
        return 0
    fi
    
    # Start in background
    OLLAMA_HOST="${OLLAMA_HOST}:${OLLAMA_PORT}" ollama serve &
    local pid=$!
    
    # Wait for service to start
    local retries=10
    local count=0
    while ! check_ollama_running; do
        count=$((count + 1))
        if [ $count -ge $retries ]; then
            log_error "Ollama service failed to start"
            return 1
        fi
        sleep 1
    done
    
    log_success "Ollama service started (PID: $pid)"
    return 0
}

# Pull a model
pull_model() {
    local model="$1"
    log_info "Pulling model: ${model}"
    
    if ollama pull "$model"; then
        log_success "Model ${model} pulled successfully"
        return 0
    else
        log_error "Failed to pull model ${model}"
        return 1
    fi
}

# List installed models
list_models() {
    log_info "Installed models:"
    ollama list 2>/dev/null || echo "  No models installed"
}

# Verify installation
verify_installation() {
    log_info "Verifying Ollama installation..."
    echo ""
    
    local status="OK"
    
    # Check binary
    if check_ollama_installed; then
        echo -e "  ${GREEN}✓${NC} Ollama binary: $(get_ollama_version)"
    else
        echo -e "  ${RED}✗${NC} Ollama binary: not installed"
        status="FAILED"
    fi
    
    # Check service
    if check_ollama_running; then
        local version=$(curl -s "http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        echo -e "  ${GREEN}✓${NC} Ollama service: running (v${version:-unknown})"
    else
        echo -e "  ${YELLOW}○${NC} Ollama service: not running"
        if [ "$status" = "OK" ]; then
            status="PARTIAL"
        fi
    fi
    
    # Check models
    local model_count=$(ollama list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
    if [ "$model_count" -gt 0 ]; then
        echo -e "  ${GREEN}✓${NC} Models installed: ${model_count}"
    else
        echo -e "  ${YELLOW}○${NC} Models installed: 0"
        if [ "$status" = "OK" ]; then
            status="PARTIAL"
        fi
    fi
    
    echo ""
    
    case "$status" in
        OK)
            log_success "Installation verified successfully"
            return 0
            ;;
        PARTIAL)
            log_warning "Installation partial - service not running or no models"
            return 0
            ;;
        FAILED)
            log_error "Installation verification failed"
            return 1
            ;;
    esac
}

# Print configuration
print_config() {
    echo ""
    echo "=== Ollama Configuration ==="
    echo "  Host: ${OLLAMA_HOST}"
    echo "  Port: ${OLLAMA_PORT}"
    echo "  API URL: http://${OLLAMA_HOST}:${OLLAMA_PORT}"
    echo ""
    echo "=== Environment Variables ==="
    echo "  OLLAMA_HOST    ${OLLAMA_HOST}:${OLLAMA_PORT}"
    echo ""
    echo "=== Recommended Models for Cipher ==="
    for model in "${RECOMMENDED_MODELS[@]}"; do
        echo "  - ${model}"
    done
    echo ""
}

# Main function
main() {
    local model="${DEFAULT_MODEL}"
    local pull_model=true
    local verify_only=false
    local start_service=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --model)
                model="$2"
                shift 2
                ;;
            --no-model)
                pull_model=false
                shift
                ;;
            --verify)
                verify_only=true
                shift
                ;;
            --start)
                start_service=true
                shift
                ;;
            --port)
                OLLAMA_PORT="$2"
                shift 2
                ;;
            -h|--help)
                head -30 "$0" | tail -28
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Verify only mode
    if [ "$verify_only" = true ]; then
        verify_installation
        exit $?
    fi
    
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║           KIN Local LLM - Ollama Setup                     ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Check if already installed
    if check_ollama_installed; then
        log_success "Ollama already installed: $(get_ollama_version)"
    else
        # Install based on OS
        local os=$(detect_os)
        case $os in
            macos)  install_ollama_macos ;;
            linux)  install_ollama_linux ;;
            windows) install_ollama_windows ;;
            *)      log_error "Unsupported OS: $os"; exit 1 ;;
        esac
    fi
    
    # Start service if requested
    if [ "$start_service" = true ]; then
        start_ollama_service
    fi
    
    # Pull model
    if [ "$pull_model" = true ]; then
        pull_model "$model"
    fi
    
    # Print configuration
    print_config
    
    # List models
    list_models
    
    # Verify
    verify_installation
    
    log_success "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Ensure Ollama service is running: ollama serve"
    echo "  2. Test the model: ollama run ${model}"
    echo "  3. Configure inference/local-llm.ts with the model name"
    echo ""
}

main "$@"
