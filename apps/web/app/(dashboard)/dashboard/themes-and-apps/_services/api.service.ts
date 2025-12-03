'use client';

import axios, { AxiosResponse } from 'axios';
import { aes, deviceInfo } from '../_utils/utils';

export interface Theme {
  _id?: string;
  themeName: string;
  categories: string[];
  themePrice: number;
  currency: string;
  thumb?: string;
  description?: string;
  introText?: string;
  approved?: boolean;
  mid?: number;
  previewUrl?: string;
  themeImages?: Array<{ name: string; thumb: string }>;
  documentId?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

interface SecureServiceCrudParams {
  path: string;
  action: string;
  data: any;
  token: string | null;
  baseUrl?: string;
}

class ApiService {
  private baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.jetcamer.com';
  private token: string | null = null;
  private memberID: number | null = null;
  private org: string | null = null;
  private appId = process.env.NEXT_PUBLIC_APP_ID || 'com.mesdoh.app';

  setAuth(token: string, memberID: number, org: string) {
    this.token = token;
    this.memberID = memberID;
    this.org = org;
  }

  /**
   * Secure service CRUD method matching the Angular data-rest.service pattern
   * This method encrypts the request data using AES encryption and sends it to the /scrud endpoint
   */
  secureServiceCrud(params: SecureServiceCrudParams): Promise<AxiosResponse<any>> {
    const { path, action, data, token, baseUrl } = params;

    // Set token or use timestamp as fallback
    const requestToken = token ? `${token}` : `${new Date().getTime()}`;

    // Prepare data with required fields
    const requestData = {
      ...data,
      mid: data.mid !== undefined ? data.mid : this.memberID,
      acl: 1,
      device: deviceInfo(),
      appId: this.appId,
      mdReqUrl: typeof window !== 'undefined' ? window.location.href : '',
    };

    // Prepare params object for encryption
    const paramsToEncrypt = {
      path,
      action,
      data: requestData,
      token: requestToken,
      baseUrl: baseUrl || this.baseURL,
    };

    // Encrypt the entire params object
    const encryptedData = aes(paramsToEncrypt);

    // Prepare request payload
    const reqData = {
      data: encryptedData,
      token: requestToken,
    };

    // Return early if no action specified
    if (!action) {
      return Promise.resolve({} as AxiosResponse);
    }

    // Use provided baseUrl or fall back to default
    const apiBaseUrl = baseUrl || this.baseURL;

    // Make POST request to /scrud endpoint
    return axios.post(`${apiBaseUrl}/scrud`, reqData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getOrgThemes(): Promise<ApiResponse<{ themes: Theme[] }>> {
    try {
      if (!this.memberID) {
        return { data: { themes: [] } };
      }

      const response = await this.secureServiceCrud({
        path: 'association',
        action: 'getOrgThemes',
        token: this.token,
        data: {
          mid: this.memberID,
        },
      });

      return { data: response.data || { themes: [] } };
    } catch (error: any) {
      return {
        error: error.response?.data?.message || error.message || 'An error occurred',
        data: { themes: [] },
      };
    }
  }

  async getApprovedThemes(): Promise<ApiResponse<{ themes: Theme[] }>> {
    try {
      const response = await this.secureServiceCrud({
        path: 'association',
        action: 'getApprovedThemes',
        token: this.token,
        data: {},
      });

      return { data: response.data || { themes: [] } };
    } catch (error: any) {
      return {
        error: error.response?.data?.message || error.message || 'An error occurred',
        data: { themes: [] },
      };
    }
  }

  async addTheme(themeData: Partial<Theme>): Promise<ApiResponse<Theme>> {
    try {
      const response = await this.secureServiceCrud({
        path: 'association',
        action: 'addOrgTheme',
        token: this.token,
        data: {
          ...themeData,
          org: this.org,
          mid: this.memberID,
        },
      });

      return { data: response.data };
    } catch (error: any) {
      return {
        error: error.response?.data?.message || error.message || 'An error occurred',
      };
    }
  }

  async updateTheme(themeId: string, themeData: Partial<Theme>): Promise<ApiResponse<Theme>> {
    try {
      const response = await this.secureServiceCrud({
        path: 'association',
        action: 'updateOrgTheme',
        token: this.token,
        data: {
          ...themeData,
          _id: themeId,
          org: this.org,
          mid: this.memberID,
        },
      });

      return { data: response.data };
    } catch (error: any) {
      return {
        error: error.response?.data?.message || error.message || 'An error occurred',
      };
    }
  }

  async deleteTheme(themeId: string): Promise<ApiResponse<void>> {
    try {
      const response = await this.secureServiceCrud({
        path: 'association',
        action: 'deleteTheme',
        token: this.token,
        data: {
          _id: themeId,
          org: this.org,
          mid: this.memberID,
        },
      });

      return { data: response.data };
    } catch (error: any) {
      return {
        error: error.response?.data?.message || error.message || 'An error occurred',
      };
    }
  }

  async downloadTheme(themeId: string): Promise<ApiResponse<{ themeUrl: string }>> {
    try {
      const response = await this.secureServiceCrud({
        path: 'association',
        action: 'downloadTheme',
        token: this.token,
        data: {
          _id: themeId,
          org: this.org,
          mid: this.memberID,
        },
      });

      return { data: response.data };
    } catch (error: any) {
      return {
        error: error.response?.data?.message || error.message || 'An error occurred',
      };
    }
  }

  async uploadThemeFile(
    file: File,
    formData: any,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<Theme>> {
    try {
      // Create FormData matching Angular file-upload component pattern
      const uploadFormData = new FormData();
      
      // Determine member ID - prioritize formData.mid, then this.memberID, then default to 1 for testing
      const memberId = formData.mid !== undefined ? formData.mid : (this.memberID || 1);
      
      // Build the data object matching Angular uploadData getter pattern
      const dataObject = {
        ...{ org: this.org, mid: memberId },
        ...formData,
      };
      
      // Structure FormData exactly like Angular file-upload component
      uploadFormData.append('path', 'association');
      uploadFormData.append('action', 'addOrgTheme');
      uploadFormData.append('data', JSON.stringify(dataObject));
      uploadFormData.append('file', file, file.name);
      uploadFormData.append('name', file.name);
      uploadFormData.append('mimeType', file.type || 'application/zip');
      
      // Upload to /upload endpoint (matching Angular doUpload pattern)
      const uploadUrl = `${this.baseURL}/upload`;
      
      const response = await axios.post(uploadUrl, uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      });

      // Angular expects response.body in HttpResponse, but axios returns data directly
      const responseBody = response.data?.body || response.data?.response?.body || response.data;
      
      return { data: responseBody || response.data };
    } catch (error: any) {
      return {
        error: error.response?.data?.message || error.message || 'Upload failed',
      };
    }
  }
}

export const apiService = new ApiService();







