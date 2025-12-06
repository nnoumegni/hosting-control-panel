import { google } from 'googleapis';
import { logger } from '../../core/logger/index.js';
import { decryptSecret } from '@hosting/common';

export interface GoogleWorkspaceCredentials {
  serviceAccountJson: string; // JSON string of service account
  delegatedAdmin: string; // Email of admin to impersonate
}

export interface GoogleWorkspaceUser {
  id: string;
  email: string;
  name: {
    givenName: string;
    familyName: string;
    fullName: string;
  };
  suspended: boolean;
  isAdmin: boolean;
  createdAt: string;
}

export interface CreateGoogleUserInput {
  email: string;
  givenName: string;
  familyName: string;
  password?: string;
  suspended?: boolean;
}

export interface UpdateGoogleUserInput {
  givenName?: string;
  familyName?: string;
  suspended?: boolean;
}

export class GoogleWorkspaceService {
  /**
   * Validate Google Workspace credentials
   */
  async validateCredentials(encryptedCredentials: string, passphrase: string): Promise<boolean> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const auth = this.createAuth(credentials);

      // Test by listing users (limited to 1)
      const admin = google.admin({ version: 'directory_v1', auth });
      await admin.users.list({
        domain: this.extractDomain(credentials.delegatedAdmin),
        maxResults: 1,
      });

      return true;
    } catch (error) {
      logger.error({ err: error }, 'Google Workspace credentials validation failed');
      return false;
    }
  }

  /**
   * List users in Google Workspace
   */
  async listUsers(encryptedCredentials: string, passphrase: string, domain: string): Promise<GoogleWorkspaceUser[]> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const auth = this.createAuth(credentials);
      const admin = google.admin({ version: 'directory_v1', auth });

      const response = await admin.users.list({
        domain,
        maxResults: 500,
      });

      const users = response.data.users || [];
      return users.map((user) => ({
        id: user.id || '',
        email: user.primaryEmail || '',
        name: {
          givenName: user.name?.givenName || '',
          familyName: user.name?.familyName || '',
          fullName: user.name?.fullName || '',
        },
        suspended: user.suspended === true,
        isAdmin: user.isAdmin === true,
        createdAt: user.creationTime || '',
      }));
    } catch (error) {
      logger.error({ err: error, domain }, 'Failed to list Google Workspace users');
      throw new Error(`Failed to list users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new user in Google Workspace
   */
  async createUser(
    encryptedCredentials: string,
    passphrase: string,
    input: CreateGoogleUserInput,
  ): Promise<GoogleWorkspaceUser> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const auth = this.createAuth(credentials);
      const admin = google.admin({ version: 'directory_v1', auth });

      const response = await admin.users.insert({
        requestBody: {
          primaryEmail: input.email,
          name: {
            givenName: input.givenName,
            familyName: input.familyName,
          },
          password: input.password,
          suspended: input.suspended || false,
        },
      });

      const user = response.data;
      return {
        id: user.id || '',
        email: user.primaryEmail || '',
        name: {
          givenName: user.name?.givenName || '',
          familyName: user.name?.familyName || '',
          fullName: user.name?.fullName || '',
        },
        suspended: user.suspended === true,
        isAdmin: user.isAdmin === true,
        createdAt: user.creationTime || '',
      };
    } catch (error) {
      logger.error({ err: error, input }, 'Failed to create Google Workspace user');
      throw new Error(`Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update a user in Google Workspace
   */
  async updateUser(
    encryptedCredentials: string,
    passphrase: string,
    userId: string,
    input: UpdateGoogleUserInput,
  ): Promise<GoogleWorkspaceUser> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const auth = this.createAuth(credentials);
      const admin = google.admin({ version: 'directory_v1', auth });

      const requestBody: any = {};
      if (input.givenName !== undefined || input.familyName !== undefined) {
        requestBody.name = {};
        if (input.givenName !== undefined) requestBody.name.givenName = input.givenName;
        if (input.familyName !== undefined) requestBody.name.familyName = input.familyName;
      }
      if (input.suspended !== undefined) {
        requestBody.suspended = input.suspended;
      }

      const response = await admin.users.update({
        userKey: userId,
        requestBody,
      });

      const user = response.data;
      return {
        id: user.id || '',
        email: user.primaryEmail || '',
        name: {
          givenName: user.name?.givenName || '',
          familyName: user.name?.familyName || '',
          fullName: user.name?.fullName || '',
        },
        suspended: user.suspended === true,
        isAdmin: user.isAdmin === true,
        createdAt: user.creationTime || '',
      };
    } catch (error) {
      logger.error({ err: error, userId, input }, 'Failed to update Google Workspace user');
      throw new Error(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Suspend a user in Google Workspace
   */
  async suspendUser(encryptedCredentials: string, passphrase: string, userId: string): Promise<void> {
    await this.updateUser(encryptedCredentials, passphrase, userId, { suspended: true });
  }

  /**
   * Reset user password in Google Workspace
   */
  async resetPassword(
    encryptedCredentials: string,
    passphrase: string,
    userId: string,
    newPassword: string,
  ): Promise<void> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const auth = this.createAuth(credentials);
      const admin = google.admin({ version: 'directory_v1', auth });

      await admin.users.update({
        userKey: userId,
        requestBody: {
          password: newPassword,
        },
      });
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to reset Google Workspace user password');
      throw new Error(`Failed to reset password: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a user in Google Workspace
   */
  async deleteUser(encryptedCredentials: string, passphrase: string, userId: string): Promise<void> {
    try {
      const credentials = this.decryptCredentials(encryptedCredentials, passphrase);
      const auth = this.createAuth(credentials);
      const admin = google.admin({ version: 'directory_v1', auth });

      await admin.users.delete({
        userKey: userId,
      });
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to delete Google Workspace user');
      throw new Error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createAuth(credentials: GoogleWorkspaceCredentials) {
    try {
      const serviceAccount = JSON.parse(credentials.serviceAccountJson);
      const jwtClient = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
          'https://www.googleapis.com/auth/admin.directory.user',
          'https://www.googleapis.com/auth/admin.directory.user.readonly',
        ],
        subject: credentials.delegatedAdmin,
      });

      return jwtClient;
    } catch (error) {
      logger.error({ err: error }, 'Failed to create Google Workspace auth client');
      throw new Error('Invalid service account JSON');
    }
  }

  private decryptCredentials(encryptedCredentials: string, passphrase: string): GoogleWorkspaceCredentials {
    try {
      const decrypted = decryptSecret(encryptedCredentials, passphrase);
      return JSON.parse(decrypted) as GoogleWorkspaceCredentials;
    } catch (error) {
      logger.error({ err: error }, 'Failed to decrypt Google Workspace credentials');
      throw new Error('Failed to decrypt credentials');
    }
  }

  private extractDomain(email: string): string {
    return email.split('@')[1] || '';
  }
}



