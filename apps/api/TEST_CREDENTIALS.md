# Test Credentials

## Development Mode Authentication

When running in development mode (`NODE_ENV=development`), the API automatically creates a default admin user for testing.

### Default Test User

- **Username**: `admin`
- **Email**: `admin@example.com`
- **Password**: Set via `DEV_ADMIN_PASSWORD` environment variable, or defaults to `ChangeMe123!`
- **Role**: `superadmin`

### Current Configuration

The password is configured in `.env` file:
```bash
DEV_ADMIN_PASSWORD=admin123
```

### Login Endpoint

```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### Response

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "refreshExpiresIn": 604800,
  "user": {
    "id": "...",
    "username": "admin",
    "email": "admin@example.com",
    "displayName": "System Administrator",
    "role": "superadmin"
  }
}
```

### Using the Access Token

Include the access token in the `Authorization` header for authenticated requests:

```bash
Authorization: Bearer <accessToken>
```

## Email Provider Integration

For testing email provider integration (Google Workspace / Microsoft 365), you'll need:

1. **Encryption Passphrase**: Already configured in `.env` as `FIREWALL_CREDENTIAL_PASSPHRASE`
   - This is used to encrypt provider credentials before storing in MongoDB
   - Minimum 16 characters required

2. **Provider Credentials**: You'll need to provide:
   - **Google Workspace**: Service Account JSON + Delegated Admin Email
   - **Microsoft 365**: Tenant ID + Client ID + Client Secret

These are provided when configuring a provider via the API endpoints.

## Notes

- The test user is only created in development mode
- In production, you should use a MongoDB-backed authentication repository
- Never commit real passwords or credentials to git
- The `.env` file is already in `.gitignore` and won't be committed

