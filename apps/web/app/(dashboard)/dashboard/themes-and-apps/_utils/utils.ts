'use client';

import * as CryptoJS from 'crypto-js';
import Swal from 'sweetalert2';
import { uniqBy as lodashUniqBy } from 'lodash';

/**
 * AES encryption utility matching the Angular UtilsService.aes pattern
 */
export function aes(params: { data?: any; token?: any; path?: string; action?: string; baseUrl?: string }): string {
  const token = params.token || `${new Date().getTime()}`;
  return CryptoJS.AES.encrypt(JSON.stringify(params), token, {}).toString();
}

/**
 * Device info utility matching the Angular UtilsService.deviceInfo pattern
 */
export function deviceInfo(): any {
  if (typeof window === 'undefined') {
    return { uuid: `device-${Date.now()}` };
  }
  const device = (window as any).device || {};
  return {
    ...JSON.parse(JSON.stringify(device)),
    ...{ uuid: device.uuid || `device-${Date.now()}` },
  };
}

/**
 * Show loading indicator using SweetAlert2
 */
export function showLoading(message: string = 'Loading...'): void {
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

/**
 * Hide loading indicator
 */
export function hideLoading(): void {
  Swal.close();
}

/**
 * Update loading progress message
 */
export function updateLoadingProgress(message: string): void {
  Swal.update({
    title: message,
  });
}

/**
 * Show success message
 */
export function showSuccess(title: string, message: string = ''): void {
  Swal.fire({
    title,
    text: message,
    icon: 'success',
    timer: 3000,
    showConfirmButton: false,
  });
}

/**
 * Show error message
 */
export function showError(title: string, message: string = ''): void {
  Swal.fire({
    title,
    text: message,
    icon: 'error',
    confirmButtonText: 'OK',
  });
}

/**
 * Show confirmation dialog for delete actions
 * Returns a Promise that resolves to true if confirmed, false otherwise
 */
export async function confirmDelete(itemName: string): Promise<boolean> {
  const result = await Swal.fire({
    title: 'Delete this item?',
    html: `(${itemName})`,
    input: 'text',
    inputAttributes: {
      autocapitalize: 'off',
      autocomplete: 'off',
    },
    reverseButtons: true,
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#8B4513',
    showLoaderOnConfirm: true,
    inputPlaceholder: 'Type: delete',
    preConfirm: (inputValue) => {
      if (!(inputValue && inputValue.toLowerCase() === 'delete')) {
        Swal.showValidationMessage('You must enter <b>delete</b> to confirm!');
        return false;
      }
      return true;
    },
    allowOutsideClick: () => !Swal.isLoading(),
  });

  return result.isConfirmed && result.value === true;
}

/**
 * Download a file from URL
 */
export function downloadFile(url: string, fileName?: string): void {
  if (!url) return;

  fileName = fileName || url.split('/').pop()?.split('?')[0] || 'download';

  // Create a temporary anchor element
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  
  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Open URL in new browser window/tab
 */
export function openBrowser(url: string): void {
  if (!url) return;
  window.open(url, '_blank');
}

/**
 * Preload an image
 * Returns a Promise that resolves when the image is loaded
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Re-export lodash uniqBy for convenience
 */
export { lodashUniqBy as uniqBy };











