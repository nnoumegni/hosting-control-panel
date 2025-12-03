# Monitoring Dashboard

This dashboard allows you to install, manage, and monitor the cyber-agent on EC2 instances via AWS Systems Manager (SSM).

## Features

- **SSM-based Installation**: Install the cyber-agent on EC2 instances using SSM Run Command
- **Status Monitoring**: Check if the agent is installed and running
- **Live Analytics**: View real-time analytics data from the agent
- **Remote Management**: Manage agents on remote instances without SSH access

## Prerequisites

1. **AWS Credentials**: The dashboard backend needs AWS credentials with permissions for:
   - `ssm:SendCommand`
   - `ssm:GetCommandInvocation`
   - `ssm:DescribeInstanceInformation`
   - `ec2:DescribeInstances`

2. **SSM Agent**: The target EC2 instance must have the SSM agent installed and running. The instance must also have an IAM role with the `AmazonSSMManagedInstanceCore` policy.

3. **Environment Variables**: Set the following environment variables:
   ```bash
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   
   # Optional: Override agent install URLs
   CYBER_AGENT_INSTALL_URL=https://api.jetcamer.com/cyber-agent/install.sh
   CYBER_AGENT_UNINSTALL_URL=https://api.jetcamer.com/cyber-agent/uninstall.sh
   ```

## Setup

1. **Install Dependencies**:
   ```bash
   cd monitoring/dashboard/backend
   npm install
   ```

2. **Start the Backend**:
   ```bash
   npm run dev
   # or
   npm start
   ```

3. **Start the Frontend** (if using React):
   ```bash
   cd ../frontend
   npm install
   npm start
   ```

## API Endpoints

### Check Agent Status
```bash
GET /api/agent/ssm/status?instanceId=i-1234567890abcdef0
```

Returns:
```json
{
  "isInstalled": true,
  "isRunning": true
}
```

### Install Agent
```bash
POST /api/agent/ssm/install
Content-Type: application/json

{
  "instanceId": "i-1234567890abcdef0"
}
```

Returns:
```json
{
  "commandId": "abc-123-def",
  "status": "InProgress"
}
```

### Uninstall Agent
```bash
POST /api/agent/ssm/uninstall
Content-Type: application/json

{
  "instanceId": "i-1234567890abcdef0"
}
```

### Check Command Status
```bash
GET /api/agent/ssm/command?commandId=abc-123-def&instanceId=i-1234567890abcdef0
```

### Fetch Agent Data
```bash
GET /api/agent/ssm/data?instanceId=i-1234567890abcdef0&endpoint=/live
```

## Testing

Use the provided test script to verify the installation:

```bash
cd monitoring/dashboard
INSTANCE_ID=i-1234567890abcdef0 API_URL=http://localhost:4000 ./test-ssm-agent.sh
```

## How It Works

1. **Installation**: The dashboard uses SSM Run Command to execute the install script on the target instance. The install script downloads and installs the cyber-agent binary, sets up systemd service, and starts it.

2. **Status Checking**: The dashboard checks if the agent is installed by:
   - Verifying SSM agent is available on the instance
   - Running a command to check if the cyber-agent service exists and is running

3. **Data Fetching**: Since the agent runs on `127.0.0.1:9811` on the instance, the dashboard uses SSM Run Command to execute `curl` locally on the instance to fetch data from the agent's API.

## Troubleshooting

### SSM Agent Not Available
If you get an error that SSM agent is not available:
- Ensure the instance has the SSM agent installed
- Check that the instance has an IAM role with `AmazonSSMManagedInstanceCore` policy
- Verify the instance is in "running" state

### Installation Fails
- Check the command status using the `commandId` returned from the install endpoint
- Verify the instance has internet access to download the agent binary
- Check instance logs: `sudo journalctl -u jetcamer-agent -f`

### Data Fetching Fails
- Ensure the agent is running: `sudo systemctl status jetcamer-agent`
- Check agent logs: `sudo tail -f /var/log/jetcamer-agent/agent.log`
- Verify the agent is listening on `127.0.0.1:9811`: `curl http://127.0.0.1:9811/live`


