# Troubleshooting Guide

Common issues and solutions for Kin companions.

## Connection Issues

### Kin Shows Offline

**Symptoms:** Kin status displays "offline" in Mission Control

**Solutions:**
1. Check your internet connection
2. Verify the host device is powered on
3. Restart the Kin service from VPS Health widget
4. Check for system maintenance notifications

### Network Timeout

**Symptoms:** Actions take too long or fail with timeout

**Solutions:**
1. Check VPS health in Mission Control
2. Reduce concurrent operations
3. Clear browser cache and retry
4. Try a different network connection

## Voice Issues

### Microphone Not Detected

**Solutions:**
1. Check browser microphone permissions
2. Verify microphone works in other apps
3. Try refreshing the page
4. Use a different browser (Chrome recommended)

### Voice Responses Delayed

**Solutions:**
1. Check internet speed (minimum 5 Mbps)
2. Close bandwidth-heavy applications
3. Reduce audio quality in settings
4. Use wired connection instead of WiFi

## Tailscale Issues

### Device Won't Connect

**Solutions:**
1. Verify auth key hasn't expired
2. Check Tailscale is running on both devices
3. Restart Tailscale app
4. Generate a new auth key from Mission Control

### Can't Access Kin Remotely

**Solutions:**
1. Verify both devices show "online" in Network Health
2. Check firewall settings on host device
3. Confirm you're on the correct tailnet
4. Try disconnecting and reconnecting Tailscale

## Performance Issues

### Slow Response Times

**Solutions:**
1. Check VPS CPU/memory in health widget
2. Reduce active Kin sessions
3. Clear browser cache
4. Check for background processes

### High Memory Usage

**Solutions:**
1. Restart the Kin process
2. Clear conversation history
3. Disable unused features
4. Check for memory leaks (report if found)

## Account Issues

### Can't Claim Kin

**Solutions:**
1. Verify wallet has sufficient SOL for transaction
2. Check Solana network status
3. Ensure Kin hasn't already been claimed
4. Try a different wallet

### Ownership Not Showing

**Solutions:**
1. Refresh Mission Control page
2. Verify NFT is in connected wallet
3. Check transaction on Solana explorer
4. Contact support with transaction ID

## Error Messages

### "Service Unavailable"
- Wait a few minutes and retry
- Check status page for outages
- Contact support if persistent

### "Authentication Failed"
- Log out and log back in
- Clear browser cookies
- Verify wallet connection

### "Rate Limit Exceeded"
- Wait before retrying
- Reduce request frequency
- Contact support for limit increase

## Getting More Help

If these solutions don't resolve your issue:

1. **Use Support Chat** - Click the chat icon in Mission Control
2. **Escalate to Human** - Request human support from chat
3. **Check Status Page** - status.kr8tiv.ai for system status
4. **Community Discord** - Join for community support

When contacting support, please provide:
- Your Kin ID
- Error messages (exact text)
- Steps you've already tried
- Screenshots if applicable
