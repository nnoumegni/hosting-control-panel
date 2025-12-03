// agent/src/security/sg-manager.ts
import {
  EC2Client,
  AuthorizeSecurityGroupIngressCommand,
  RevokeSecurityGroupIngressCommand,
  DescribeSecurityGroupsCommand
} from "@aws-sdk/client-ec2";
import { logger } from "../core/logger";
import { state } from "../core/state";

const client = new EC2Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function getExistingRules() {
  const sgId = state.settings.sgId;

  const res = await client.send(
    new DescribeSecurityGroupsCommand({
      GroupIds: [sgId],
    })
  );

  const sg = res.SecurityGroups?.[0];
  if (!sg) return [];

  const rules = sg.IpPermissions.flatMap(p =>
    p.IpRanges?.map(r => r.CidrIp) || []
  );

  return rules;
}

export async function addRule(ip: string) {
  const sgId = state.settings.sgId;

  try {
    logger.info("Adding SG rule", ip);

    await client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: sgId,
        IpPermissions: [
          {
            IpProtocol: "tcp",
            FromPort: 80,
            ToPort: 80,
            IpRanges: [
              {
                CidrIp: `${ip}/32`,
                Description: `auto-blocked`,
              },
            ],
          },
        ],
      })
    );

    return true;
  } catch (err: any) {
    if (err.message?.includes("InvalidPermission.Duplicate")) {
      logger.warn("Rule already exists", ip);
      return false;
    }
    logger.error("Error adding SG rule", err);
    return false;
  }
}

export async function removeRule(ip: string) {
  const sgId = state.settings.sgId;

  try {
    logger.info("Removing SG rule", ip);

    await client.send(
      new RevokeSecurityGroupIngressCommand({
        GroupId: sgId,
        IpPermissions: [
          {
            IpProtocol: "tcp",
            FromPort: 80,
            ToPort: 80,
            IpRanges: [{ CidrIp: `${ip}/32` }],
          },
        ],
      })
    );

    return true;
  } catch (err) {
    logger.error("Error removing SG rule", err);
    return false;
  }
}
