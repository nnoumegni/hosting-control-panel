#!/usr/bin/env bash

# Script to get Security Group ID and Network ACL ID from an EC2 instance
# Can be run from anywhere with AWS credentials, or from the EC2 instance itself

set -euo pipefail

# Configuration
INSTANCE_ID="${INSTANCE_ID:-}"
AWS_REGION="${AWS_REGION:-us-west-2}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 EC2 Firewall Resource Discovery"
echo "=================================="
echo ""

# Check if running on EC2 instance
if [[ -f /sys/hypervisor/uuid ]] || curl -s --max-time 1 http://169.254.169.254/latest/meta-data/instance-id >/dev/null 2>&1; then
  if [[ -z "${INSTANCE_ID:-}" ]]; then
    echo "📦 Detected EC2 instance environment, fetching instance metadata..."
    INSTANCE_ID=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "")
    AWS_REGION=$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || echo "${AWS_REGION}")
    echo "   Instance ID: ${INSTANCE_ID}"
    echo "   Region: ${AWS_REGION}"
    echo ""
  fi
fi

# Check for AWS CLI
if ! command -v aws >/dev/null 2>&1; then
  echo -e "${RED}❌ ERROR: AWS CLI is not installed.${NC}" >&2
  echo "" >&2
  echo "Install it with:" >&2
  echo "  macOS: brew install awscli" >&2
  echo "  Linux: sudo apt-get install awscli  # or use pip install awscli" >&2
  echo "" >&2
  exit 1
fi

# Configure AWS credentials if provided
if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  export AWS_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY
  export AWS_DEFAULT_REGION="${AWS_REGION}"
  echo "✅ Using provided AWS credentials"
  echo ""
elif [[ -z "${INSTANCE_ID:-}" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: No AWS credentials provided and not running on EC2 instance.${NC}" >&2
  echo "   Using default AWS credential chain (IAM role, ~/.aws/credentials, etc.)" >&2
  echo ""
fi

# If instance ID not provided, try to get it
if [[ -z "${INSTANCE_ID:-}" ]]; then
  echo -e "${RED}❌ ERROR: EC2 Instance ID is required.${NC}" >&2
  echo "" >&2
  echo "Provide it via:" >&2
  echo "  INSTANCE_ID=i-1234567890abcdef0 ./scripts/get-ec2-firewall-ids.sh" >&2
  echo "" >&2
  echo "Or run this script on the EC2 instance to auto-detect it." >&2
  echo "" >&2
  exit 1
fi

echo "🔎 Querying AWS for instance: ${INSTANCE_ID}"
echo ""

# Get instance details
echo "📋 Fetching instance information..."
INSTANCE_INFO=$(aws ec2 describe-instances \
  --instance-ids "${INSTANCE_ID}" \
  --region "${AWS_REGION}" \
  --query 'Reservations[0].Instances[0]' \
  --output json 2>&1)

if echo "${INSTANCE_INFO}" | grep -q "InvalidInstanceID"; then
  echo -e "${RED}❌ ERROR: Invalid instance ID: ${INSTANCE_ID}${NC}" >&2
  exit 1
fi

if echo "${INSTANCE_INFO}" | grep -q "does not exist"; then
  echo -e "${RED}❌ ERROR: Instance ${INSTANCE_ID} does not exist in region ${AWS_REGION}${NC}" >&2
  exit 1
fi

# Extract Security Group IDs
SECURITY_GROUP_IDS=$(echo "${INSTANCE_INFO}" | jq -r '.SecurityGroups[].GroupId' 2>/dev/null || echo "")

if [[ -z "${SECURITY_GROUP_IDS}" ]]; then
  echo -e "${RED}❌ ERROR: Could not retrieve Security Group IDs${NC}" >&2
  exit 1
fi

# Get the first (primary) Security Group ID
PRIMARY_SG_ID=$(echo "${SECURITY_GROUP_IDS}" | head -n1)

# Extract Subnet ID
SUBNET_ID=$(echo "${INSTANCE_INFO}" | jq -r '.SubnetId' 2>/dev/null || echo "")

if [[ -z "${SUBNET_ID}" ]]; then
  echo -e "${RED}❌ ERROR: Could not retrieve Subnet ID${NC}" >&2
  exit 1
fi

echo "   Subnet ID: ${SUBNET_ID}"
echo "   Security Group IDs:"
echo "${SECURITY_GROUP_IDS}" | while read -r sg_id; do
  echo "     - ${sg_id}"
done
echo ""

# Get Network ACL ID from Subnet
echo "📋 Fetching Network ACL for subnet: ${SUBNET_ID}..."
SUBNET_INFO=$(aws ec2 describe-subnets \
  --subnet-ids "${SUBNET_ID}" \
  --region "${AWS_REGION}" \
  --query 'Subnets[0]' \
  --output json 2>&1)

VPC_ID=$(echo "${SUBNET_INFO}" | jq -r '.VpcId' 2>/dev/null || echo "")

if [[ -z "${VPC_ID}" ]]; then
  echo -e "${RED}❌ ERROR: Could not retrieve VPC ID${NC}" >&2
  exit 1
fi

# Get Network ACLs for the VPC (subnet uses the default ACL or a custom one)
NETWORK_ACLS=$(aws ec2 describe-network-acls \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --region "${AWS_REGION}" \
  --query 'NetworkAcls[*].[NetworkAclId,IsDefault,Associations[?SubnetId==`'"${SUBNET_ID}"'`].NetworkAclAssociationId]' \
  --output json 2>&1)

# Find the Network ACL associated with the subnet
NETWORK_ACL_ID=""
if echo "${NETWORK_ACLS}" | jq -e '.[] | select(.[2] != [])' >/dev/null 2>&1; then
  # Subnet has a custom ACL
  NETWORK_ACL_ID=$(echo "${NETWORK_ACLS}" | jq -r '.[] | select(.[2] != []) | .[0]' | head -n1)
elif echo "${NETWORK_ACLS}" | jq -e '.[] | select(.[1] == true)' >/dev/null 2>&1; then
  # Use default ACL
  NETWORK_ACL_ID=$(echo "${NETWORK_ACLS}" | jq -r '.[] | select(.[1] == true) | .[0]' | head -n1)
else
  # Fallback: use first ACL
  NETWORK_ACL_ID=$(echo "${NETWORK_ACLS}" | jq -r '.[0][0]' 2>/dev/null || echo "")
fi

echo ""
echo "=================================="
echo -e "${GREEN}✅ Results:${NC}"
echo "=================================="
echo ""
echo "Security Group ID (Primary):"
echo -e "${GREEN}  ${PRIMARY_SG_ID}${NC}"
echo ""
if [[ $(echo "${SECURITY_GROUP_IDS}" | wc -l) -gt 1 ]]; then
  echo "All Security Group IDs:"
  echo "${SECURITY_GROUP_IDS}" | while read -r sg_id; do
    echo "  - ${sg_id}"
  done
  echo ""
fi

if [[ -n "${NETWORK_ACL_ID}" ]]; then
  echo "Network ACL ID:"
  echo -e "${GREEN}  ${NETWORK_ACL_ID}${NC}"
else
  echo -e "${YELLOW}⚠️  WARNING: Could not determine Network ACL ID${NC}"
  echo "   The subnet may not have an associated Network ACL."
fi

echo ""
echo "=================================="
echo "📝 Configuration Values:"
echo "=================================="
echo ""
echo "For firewall settings, use:"
echo "  Security Group ID: ${PRIMARY_SG_ID}"
if [[ -n "${NETWORK_ACL_ID}" ]]; then
  echo "  Network ACL ID: ${NETWORK_ACL_ID}"
fi
echo ""
echo "Or set environment variables:"
echo "  export FIREWALL_SECURITY_GROUP_ID=\"${PRIMARY_SG_ID}\""
if [[ -n "${NETWORK_ACL_ID}" ]]; then
  echo "  export FIREWALL_NETWORK_ACL_ID=\"${NETWORK_ACL_ID}\""
fi
echo ""

