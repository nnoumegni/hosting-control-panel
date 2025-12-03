'use client';

import { useRef, useState, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import JSZip from 'jszip';

interface FileUploadProps {
  accept?: string;
  maxFiles?: number;
  onFileChange: (files: File[]) => void;
  placeholder?: string;
  existingFiles?: Array<{ name: string; thumb: string }>;
  onRemoveFile?: (index: number) => void;
  disabled?: boolean;
  onZipContent?: (data: { thumb?: string; files?: string[] }) => void;
  fileInfo?: Record<number, { preview?: string }>;
}

export function FileUpload({
  accept = 'image/*',
  maxFiles = 1,
  onFileChange,
  placeholder = 'Upload file',
  existingFiles = [],
  onRemoveFile,
  disabled = false,
  onZipContent,
  fileInfo = {},
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const prevExistingFilesLength = useRef(existingFiles.length);
  
  useEffect(() => {
    if (existingFiles.length > prevExistingFilesLength.current) {
      setPreviews([]);
      setNewFiles([]);
    }
    prevExistingFilesLength.current = existingFiles.length;
  }, [existingFiles.length, existingFiles]);

  const isZipFile = (file: File): boolean => {
    return file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip');
  };

  const extractZipScreenshot = async (file: File) => {
    try {
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);
      let zipContent: string[] = [];
      let rootDir = '';

      zipData.forEach((relativePath, zipEntry) => {
        const fileName = zipEntry.name;
        
        if (/(^|\/)\.[^\/\.]/g.test(fileName)) {
          return;
        }

        const parts = fileName.split('/');
        if (parts.length === 2 && !parts[1]) {
          rootDir = fileName;
        } else if (!zipEntry.dir) {
          if (/screenshot/gi.test(fileName)) {
            zipData.file(fileName)?.async('arraybuffer').then((content) => {
              const type = 'image/png';
              const blob = new Blob([content], { type });
              const url = URL.createObjectURL(blob);

              if (onZipContent) {
                onZipContent({ thumb: url });
              }
            }).catch((error) => {
              console.error('Error extracting screenshot from ZIP:', error);
            });
          }
          
          zipContent.push(fileName);
        }
      });

      if (zipContent.length > 0) {
        const cleanedContent = zipContent.map((f) => f.replace(rootDir, ''));
        if (onZipContent) {
          onZipContent({ files: cleanedContent });
        }
      }
    } catch (error) {
      console.error('Error processing ZIP file:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const zipPreviewCount = (onZipContent && fileInfo[0]?.preview) ? 1 : 0;
    const currentCount = existingFiles.length + zipPreviewCount + previews.length;
    const validFiles = selectedFiles.slice(0, maxFiles - currentCount);
    
    const filesToAdd: File[] = [];
    
    const zipFiles = validFiles.filter(isZipFile);
    for (const zipFile of zipFiles) {
      await extractZipScreenshot(zipFile);
      filesToAdd.push(zipFile);
    }
    
    const imageFiles = validFiles.filter((file) => file.type.startsWith('image/'));
    
    filesToAdd.push(...imageFiles);
    
    const updatedFiles = [...newFiles, ...filesToAdd];
    setNewFiles(updatedFiles);
    
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setPreviews((prev) => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
    
    onFileChange(updatedFiles);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const zipPreview = (onZipContent && fileInfo[0]?.preview) ? fileInfo[0].preview : undefined;
  
  const filteredPreviews = previews.filter((preview, idx) => {
    const existsInExisting = existingFiles.some(existing => existing.thumb === preview);
    const correspondingFile = newFiles[idx];
    const existsByName = correspondingFile && existingFiles.some(existing => existing.name === correspondingFile.name);
    return !existsInExisting && !existsByName;
  });
  
  const totalFilesCount = existingFiles.length + (zipPreview ? 1 : 0) + filteredPreviews.length;
  
  const allFiles = [
    ...existingFiles.map((file, idx) => ({ ...file, index: idx, isExisting: true })),
    ...(zipPreview ? [{ 
      name: 'zip-preview', 
      thumb: zipPreview,
      index: existingFiles.length,
      isExisting: false
    }] : []),
    ...filteredPreviews.map((preview, idx) => ({ 
      name: `preview-${idx}`, 
      thumb: preview,
      index: existingFiles.length + (zipPreview ? 1 : 0) + idx,
      isExisting: false
    }))
  ] as Array<{ name: string; thumb: string; index: number; isExisting: boolean }>;

  const handleRemove = (clickedIndex: number) => {
    const fileToRemove = allFiles[clickedIndex];
    if (!fileToRemove) return;
    
    if (fileToRemove.isExisting) {
      if (onRemoveFile) {
        onRemoveFile(fileToRemove.index);
      }
    } else if (fileToRemove.name === 'zip-preview') {
      if (onZipContent) {
        onZipContent({ thumb: undefined });
      }
      setNewFiles([]);
      setPreviews([]);
      onFileChange([]);
    } else {
      const previewIndexInFiltered = filteredPreviews.findIndex(p => p === fileToRemove.thumb);
      
      if (previewIndexInFiltered >= 0) {
        const previewToRemove = filteredPreviews[previewIndexInFiltered];
        const actualPreviewIndex = previews.findIndex(p => p === previewToRemove);
        
        if (actualPreviewIndex >= 0) {
          setPreviews((prevPreviews) => {
            const newPreviews = prevPreviews.filter((_, i) => i !== actualPreviewIndex);
            setNewFiles((prevFiles) => {
              const newFiles = prevFiles.filter((_, i) => i !== actualPreviewIndex);
              onFileChange(newFiles);
              return newFiles;
            });
            return newPreviews;
          });
        }
      }
    }
  };

  return (
    <div className="inline-flex w-auto p-0 align-top">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={maxFiles > 1}
        onChange={handleFileSelect}
        disabled={disabled || allFiles.length >= maxFiles}
        className="hidden"
      />
      
      <div className="inline-block overflow-x-auto overflow-y-hidden p-0">
        <div className="inline-flex min-h-[120px] flex-row-reverse items-center justify-center flex-nowrap p-0">
          {totalFilesCount < maxFiles && (
            <div 
              className="flex h-[100px] min-h-[100px] w-[100px] max-w-[100px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-md border border-slate-700 bg-slate-800/50 text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-300"
              onClick={() => !disabled && totalFilesCount < maxFiles && fileInputRef.current?.click()}
            >
              <Upload className="mb-1 h-6 w-6" />
              <span className="text-center text-xs">{placeholder}</span>
              {maxFiles === 1 && fileInfo[0]?.preview && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <img 
                    src={fileInfo[0].preview} 
                    alt="preview"
                    className="max-h-full max-w-full object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {allFiles.map((file) => (
            <div
              key={file.index}
              className="relative m-0.5 flex h-[100px] min-h-[100px] w-[100px] max-w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-800/50"
            >
              <img 
                src={file.thumb} 
                alt={file.name}
                className="max-h-full max-w-full object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(file.index);
                  }}
                  className="absolute right-1 top-1 z-10 rounded-md bg-black/70 p-1 text-xs text-white transition-colors hover:bg-black/90"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

