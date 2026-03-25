# Tailscale Remote Access Setup

This guide covers setting up secure remote access to your Kin companions using Tailscale VPN.

## Prerequisites

- A Kin companion claimed and active
- Mission Control access
- Tailscale account (free for personal use)

## Quick Setup

### Method 1: QR Code (Recommended for Mobile)

1. Open Mission Control
2. Click "Setup Remote Access" in the sidebar
3. Install the Tailscale app on your mobile device
4. Open Tailscale and tap "Add Device"
5. Point your camera at the QR code displayed
6. Wait for connection confirmation

### Method 2: Auth Key (All Devices)

1. Click "Setup Remote Access" in Mission Control
2. Click "Copy" next to the auth key
3. Install Tailscale on your device
4. During setup, paste the auth key when prompted
5. Complete the connection

## Troubleshooting

### QR Code Not Scanning

- Ensure good lighting
- Hold your phone steady
- Try the auth key method instead

### Connection Fails

- Check your internet connection
- Verify the auth key hasn't expired (30-day limit)
- Restart the Tailscale app

### Device Shows Offline

- Open Tailscale and verify you're connected
- Check the Network Health widget in Mission Control
- Verify no firewall is blocking Tailscale

### Can't Access Kin

- Confirm your Kin host device is online
- Check that Tailscale is running on both devices
- Verify both devices are on the same tailnet

## Network Health

The Network Health widget shows:
- Total devices in your network
- Online/offline status
- Health score (based on device availability)

## Security Notes

- Tailscale creates a private, encrypted network
- Only devices you authorize can connect
- Traffic between devices is end-to-end encrypted
- Auth keys can be revoked at any time

## Multiple Devices

You can connect multiple devices to your Kin network:
- Phones, tablets, laptops, desktops
- Each device needs its own auth or QR scan
- Manage devices from the Network Health widget
