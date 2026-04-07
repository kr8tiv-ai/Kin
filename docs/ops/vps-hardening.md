# VPS Hardening

Minimal hardening checklist for a KIN VPS deployment. Covers firewall, SSH, brute-force protection, and automatic security updates.

## 1. UFW Firewall

KIN exposes ports 3001 (web) and 3002 (api) via Docker. The Ollama inference port (11434) must never be exposed externally — Docker internal networking handles service-to-service communication.

```bash
# Reset and set default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (required for remote access)
sudo ufw allow 22/tcp comment 'SSH'

# Allow HTTP/HTTPS (reverse proxy in front of KIN)
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Block direct access to KIN service ports from external networks.
# Docker manages its own iptables rules for container networking,
# so containers can still talk to each other on the internal bridge.
# These rules prevent external clients from bypassing your reverse proxy.
sudo ufw deny 3002/tcp comment 'Block direct API access'
sudo ufw deny 11434/tcp comment 'Block Ollama external access'

# Enable firewall
sudo ufw enable
sudo ufw status verbose
```

> **Note on Docker and UFW:** Docker modifies iptables directly, which can bypass UFW rules. For strict enforcement, see the [Docker UFW workaround](https://github.com/chaifeng/ufw-docker) or bind KIN services to `127.0.0.1` in `docker-compose.yml` and front them with a reverse proxy (nginx/Caddy) on ports 80/443.

## 2. SSH Hardening

Edit `/etc/ssh/sshd_config`:

```bash
# Disable root login
PermitRootLogin no

# Disable password authentication (key-only)
PasswordAuthentication no
PubkeyAuthentication yes

# Disable empty passwords
PermitEmptyPasswords no

# Limit authentication attempts
MaxAuthTries 3

# Disable X11 forwarding (not needed for a server)
X11Forwarding no
```

Apply changes:

```bash
sudo systemctl restart sshd
```

> **Before disabling password auth**, ensure your SSH key is installed and working. Test with a second terminal session before closing your current one.

## 3. Fail2ban

Protects against SSH and HTTP brute-force attacks.

```bash
sudo apt update && sudo apt install -y fail2ban
```

Create `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled  = true
port     = http,https
filter   = nginx-http-auth
logpath  = /var/log/nginx/error.log
maxretry = 5
```

Enable and start:

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check status
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

## 4. Unattended Upgrades

Automatically install security updates on Ubuntu/Debian:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Verify the configuration in `/etc/apt/apt.conf.d/50unattended-upgrades`:

```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};

// Auto-reboot if needed (schedule for low-traffic window)
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
```

Check status:

```bash
sudo unattended-upgrade --dry-run --debug
```

## 5. Quick Verification Checklist

```bash
# Firewall active with correct rules
sudo ufw status verbose

# SSH key-only auth confirmed
grep -E 'PasswordAuthentication|PermitRootLogin' /etc/ssh/sshd_config

# Fail2ban running
sudo fail2ban-client status

# Unattended upgrades configured
apt-config dump | grep -i unattended

# Ollama port not externally reachable (run from a different machine)
# curl http://<your-vps-ip>:11434  # Should timeout/refuse

# KIN API health (via reverse proxy)
curl -s http://localhost:3002/health
```
