import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { logger } from '../../core/logger/index.js';
import { decryptSecret } from '@hosting/common';

export interface Microsoft365Credentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface Microsoft365User {
  id: string;
  email: string;
  displayName: string;
  givenName: string;
  surname: string;
  accountEnabled: boolean;
  userPrincipalName: string;
  createdAt: string;
}

export interface CreateMicrosoft365UserInput {
  email: string;
  displayName: string;
  givenName: string;
  surname: string;
  password: string;
  accountEnabled?: boolean;
}

export interface UpdateMicrosoft365UserInput {
  displayName?: string;
  givenName?: string;
  surname?: string;
  accountEnabled?: boolean;
}

export class Microsoft365Service {
  /**
   * Validate Microsoft 365 credentials
   */
  async validateCredentials(encryptedCredentials: string, passphrase: string): Promise<boolean> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const client = await this.createClient(credentials);

      // Test by listing users (limited to 1)
      await client.api('/users').top(1).get();

      return true;
    } catch (error) {
      logger.error({ err: error }, 'Microsoft 365 credentials validation failed');
      return false;
    }
  }

  /**
   * List users in Microsoft 365
   */
  async listUsers(encryptedCredentials: string, passphrase: string): Promise<Microsoft365User[]> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const client = await this.createClient(credentials);

      const response = await client.api('/users').select('id,mail,displayName,givenName,surname,accountEnabled,userPrincipalName,createdDateTime').get();

      const users = response.value || [];
      return users.map((user: any) => ({
        id: user.id || '',
        email: user.mail || user.userPrincipalName || '',
        displayName: user.displayName || '',
        givenName: user.givenName || '',
        surname: user.surname || '',
        accountEnabled: user.accountEnabled !== false,
        userPrincipalName: user.userPrincipalName || '',
        createdAt: user.createdDateTime || '',
      }));
    } catch (error) {
      logger.error({ err: error }, 'Failed to list Microsoft 365 users');
      throw new Error(`Failed to list users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new user in Microsoft 365
   */
  async createUser(
    encryptedCredentials: string,
    passphrase: string,
    input: CreateMicrosoft365UserInput,
  ): Promise<Microsoft365User> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const client = await this.createClient(credentials);

      const userData = {
        accountEnabled: input.accountEnabled !== false,
        displayName: input.displayName,
        givenName: input.givenName,
        surname: input.surname,
        mailNickname: input.email.split('@')[0],
        userPrincipalName: input.email,
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
          password: input.password,
        },
        mail: input.email,
      };

      const user = await client.api('/users').post(userData);

      return {
        id: user.id || '',
        email: user.mail || user.userPrincipalName || '',
        displayName: user.displayName || '',
        givenName: user.givenName || '',
        surname: user.surname || '',
        accountEnabled: user.accountEnabled !== false,
        userPrincipalName: user.userPrincipalName || '',
        createdAt: user.createdDateTime || '',
      };
    } catch (error) {
      logger.error({ err: error, input }, 'Failed to create Microsoft 365 user');
      throw new Error(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update a user in Microsoft 365
   */
  async updateUser(
    encryptedCredentials: string,
    passphrase: string,
    userId: string,
    input: UpdateMicrosoft365UserInput,
  ): Promise<Microsoft365User> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const client = await this.createClient(credentials);

      const updateData: any = {};
      if (input.displayName !== undefined) updateData.displayName = input.displayName;
      if (input.givenName !== undefined) updateData.givenName = input.givenName;
      if (input.surname !== undefined) updateData.surname = input.surname;
      if (input.accountEnabled !== undefined) updateData.accountEnabled = input.accountEnabled;

      const user = await client.api(`/users/${userId}`).patch(updateData);

      return {
        id: user.id || '',
        email: user.mail || user.userPrincipalName || '',
        displayName: user.displayName || '',
        givenName: user.givenName || '',
        surname: user.surname || '',
        accountEnabled: user.accountEnabled !== false,
        userPrincipalName: user.userPrincipalName || '',
        createdAt: user.createdDateTime || '',
      };
    } catch (error) {
      logger.error({ err: error, userId, input }, 'Failed to update Microsoft 365 user');
      throw new Error(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disable a user in Microsoft 365
   */
  async disableUser(encryptedCredentials: string, passphrase: string, userId: string): Promise<void> {
    await this.updateUser(encryptedCredentials, passphrase, userId, { accountEnabled: false });
  }

  /**
   * Reset user password in Microsoft 365
   */
  async resetPassword(
    encryptedCredentials: string,
    passphrase: string,
    userId: string,
    newPassword: string,
  ): Promise<void> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const client = await this.createClient(credentials);

      await client.api(`/users/${userId}`).patch({
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
          password: newPassword,
        },
      });
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to reset Microsoft 365 user password');
      throw new Error(`Failed to reset password: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a user in Microsoft 365
   */
  async deleteUser(encryptedCredentials: string, passphrase: string, userId: string): Promise<void> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const client = await this.createClient(credentials);

      await client.api(`/users/${userId}`).delete();
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to delete Microsoft 365 user');
      throw new Error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createClient(credentials: Microsoft365Credentials): Promise<Client> {
    try {
      const credential = new ClientSecretCredential(
        credentials.tenantId,
        credentials.clientId,
        credentials.clientSecret,
      );

      // Get access token
      const tokenResponse = await credential.getToken(['https://graph.microsoft.com/.default']);
      if (!tokenResponse) {
        throw new Error('Failed to obtain access token');
      }

      // Create client with access token using simple auth provider
      const authProvider = {
        getAccessToken: async () => {
          const token = await credential.getToken(['https://graph.microsoft.com/.default']);
          return token?.token || '';
        },
      };

      return Client.initWithMiddleware({
        authProvider: authProvider as any,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create Microsoft 365 client');
      throw new Error('Failed to initialize Microsoft Graph client');
    }
  }

  private decryptCredentials(encryptedCredentials: string, passphrase: string): Microsoft365Credentials {
    try {
      const decrypted = decryptSecret(encryptedCredentials, passphrase);
      return JSON.parse(decrypted) as Microsoft365Credentials;
    } catch (error) {
      logger.error({ err: error }, 'Failed to decrypt Microsoft 365 credentials');
      throw new Error('Failed to decrypt credentials');
    }
  }
}

