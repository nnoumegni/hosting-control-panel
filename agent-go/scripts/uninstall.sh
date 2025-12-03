#!/usr/bin/env bash
set -euo pipefail

echo "──────────────────────────────────────────────"
echo "   JetCamer Agent – Full Uninstall Script"
echo "──────────────────────────────────────────────"
echo

# Detect config if present
CONFIG="/etc/jetcamer/agent.config.json"
IPSET_NAME="jetcamer_blacklist"
NFT_TABLE="inet"
NFT_CHAIN="jetcamer_drop"
AWS_REGION=""
AWS_NACL_ID=""
AWS_RULE_BASE=""

if [[ -f "$CONFIG" ]]; then
    echo "[*] Loading config from $CONFIG"
    IPSET_NAME=$(jq -r '.firewallIpsetName // "jetcamer_blacklist"' "$CONFIG")
    NFT_TABLE=$(jq -r '.firewallNftTable // "inet"' "$CONFIG")
    NFT_CHAIN=$(jq -r '.firewallNftChain // "jetcamer_drop"' "$CONFIG")
    AWS_REGION=$(jq -r '.awsRegion // ""' "$CONFIG")
    AWS_NACL_ID=$(jq -r '.awsNetworkAclId // ""' "$CONFIG")
    AWS_RULE_BASE=$(jq -r '.awsNetworkAclDenyRuleBase // ""' "$CONFIG")
fi

echo "[*] Using firewall settings:"
echo "    ipset name:  $IPSET_NAME"
echo "    nft table:   $NFT_TABLE"
echo "    nft chain:   $NFT_CHAIN"
echo

#──────────────────────────────────────────────────────────
# 1. Stop + disable systemd
#──────────────────────────────────────────────────────────
echo "[1/6] Stopping systemd service..."
sudo systemctl stop jetcamer-agent 2>/dev/null || true
sudo systemctl disable jetcamer-agent 2>/dev/null || true
sudo rm -f /etc/systemd/system/jetcamer-agent.service

# Stop and remove GeoLite update timer
sudo systemctl stop jetcamer-geolite-update.timer 2>/dev/null || true
sudo systemctl disable jetcamer-geolite-update.timer 2>/dev/null || true
sudo rm -f /etc/systemd/system/jetcamer-geolite-update.timer
sudo rm -f /etc/systemd/system/jetcamer-geolite-update.service
sudo systemctl daemon-reload

#──────────────────────────────────────────────────────────
# 2. Remove binary + configs
#──────────────────────────────────────────────────────────
echo "[2/6] Removing agent binary + configs..."
sudo rm -rf /opt/jetcamer-agent

# Remove AWS credentials if stored via API (before removing /etc/jetcamer)
if [[ -f /etc/jetcamer/aws-credentials.json ]]; then
    echo "    ✓ Removing stored AWS credentials..."
    sudo rm -f /etc/jetcamer/aws-credentials.json
fi

sudo rm -rf /etc/jetcamer

#──────────────────────────────────────────────────────────
# 3. Remove logs + state dirs
#──────────────────────────────────────────────────────────
echo "[3/6] Removing logs + state directories..."
sudo rm -rf /var/log/jetcamer-agent
sudo rm -rf /var/lib/jetcamer

#──────────────────────────────────────────────────────────
# 4. Clean ipset + nftables firewall
#──────────────────────────────────────────────────────────
echo "[4/6] Removing ipset + nftables rules..."

# ipset
if sudo ipset list "$IPSET_NAME" &>/dev/null; then
    sudo ipset destroy "$IPSET_NAME" || true
    echo "    ✓ ipset removed: $IPSET_NAME"
else
    echo "    • ipset not found ($IPSET_NAME)"
fi

# nftables
if sudo nft list chain "$NFT_TABLE" "$NFT_CHAIN" &>/dev/null; then
    sudo nft delete chain "$NFT_TABLE" "$NFT_CHAIN" || true
    echo "    ✓ nftables chain removed: $NFT_TABLE $NFT_CHAIN"
else
    echo "    • nftables chain not found ($NFT_TABLE $NFT_CHAIN)"
fi

echo

#──────────────────────────────────────────────────────────
# 5. Clean AWS Network ACL rules (optional)
#──────────────────────────────────────────────────────────

if [[ -n "$AWS_REGION" && -n "$AWS_NACL_ID" ]]; then
  echo "[5/6] AWS Network ACL cleanup..."
  echo "      NACL ID: $AWS_NACL_ID"
  echo "      Region:  $AWS_REGION"
  echo

  echo "[*] Fetching DENY rules created by agent..."
  RULES=$(aws ec2 describe-network-acls \
      --network-acl-ids "$AWS_NACL_ID" \
      --region "$AWS_REGION" \
      --query "NetworkAcls[0].Entries[?RuleAction=='deny'].[RuleNumber]" \
      --output text 2>/dev/null || echo "")

  if [[ -z "$RULES" ]]; then
      echo "    • No DENY rules found."
  else
      echo "    Found rules:"
      echo "$RULES"
      for RULE in $RULES; do
          echo "    Deleting rule #$RULE..."
          aws ec2 delete-network-acl-entry \
              --network-acl-id "$AWS_NACL_ID" \
              --rule-number "$RULE" \
              --egress false \
              --region "$AWS_REGION" || true
      done
      echo "    ✓ AWS NACL cleanup complete."
  fi
else
  echo "[5/6] Skipping AWS cleanup (region/NACL not configured)."
fi

#──────────────────────────────────────────────────────────
# 6. Done
#──────────────────────────────────────────────────────────
echo
echo "──────────────────────────────────────────────"
echo "       ✓ JetCamer Agent uninstalled"
echo "──────────────────────────────────────────────"
echo
