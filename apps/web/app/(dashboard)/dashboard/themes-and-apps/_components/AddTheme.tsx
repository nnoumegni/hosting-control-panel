'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { X, Check } from 'lucide-react';
import { Theme, apiService } from '../_services/api.service';
import { THEME_CATEGORIES, TOPUP_CURRENCIES } from '../_constants/theme-categories';
import { translations } from '../_constants/translations';
import { FileUpload } from './FileUpload';
import { FilterDropdown } from './FilterDropdown';
import { CurrencySelector } from './CurrencySelector';
import {
  showSuccess,
  showError,
  showLoading,
  hideLoading,
  updateLoadingProgress,
  uniqBy,
} from '../_utils/utils';

interface AddThemeProps {
  theme?: Theme;
  onSave: () => void;
  onCancel: () => void;
  memberID: number;
  token: string;
  org: string;
  isMesDohThemeAdmin?: boolean;
}

interface ThemeFormData {
  themeName: string;
  categories: string[];
  themePrice: number;
  currency: string;
  introText: string;
  description: string;
  approved?: boolean;
}

export function AddTheme({
  theme,
  onSave,
  onCancel,
  memberID,
  token,
  org,
  isMesDohThemeAdmin = false,
}: AddThemeProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ThemeFormData>({
    defaultValues: {
      themeName: theme?.themeName || '',
      categories: theme?.categories || [],
      themePrice: theme?.themePrice || 0,
      currency: theme?.currency || TOPUP_CURRENCIES[0],
      introText: theme?.introText || '',
      description: theme?.description || '',
      approved: theme?.approved || false,
    },
  });

  const [themeFile, setThemeFile] = useState<File | null>(null);
  const [themeImages, setThemeImages] = useState<Array<{ name: string; thumb: string }>>(
    theme?.themeImages || []
  );
  const [screenshot, setScreenshot] = useState<string>(theme?.thumb || '');
  const [fileInfo, setFileInfo] = useState<Record<number, { preview?: string }>>(
    theme?.thumb ? { 0: { preview: theme.thumb } } : {}
  );
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [themeCategories, setThemeCategories] = useState(
    THEME_CATEGORIES.map((cat) => ({
      ...cat,
      active: theme?.categories?.includes(cat.value) || false,
    }))
  );
  const [currencies, setCurrencies] = useState(TOPUP_CURRENCIES);

  const watchedCurrency = watch('currency');
  const watchedApproved = watch('approved');

  useEffect(() => {
    if (theme?.currency) {
      addCurrency(theme.currency);
    }
  }, [theme]);

  const addCurrency = (currency: string) => {
    setCurrencies((prev) => uniqBy([currency, ...prev], (c) => c));
  };

  const handleCategoryChange = (selected: any[]) => {
    const categories = selected.map((s) => s.value).filter((v) => v !== null);
    setValue('categories', categories);
    setThemeCategories(
      THEME_CATEGORIES.map((cat) => ({
        ...cat,
        active: categories.includes(cat.value),
      }))
    );
  };

  const handleFileChange = (files: File[]) => {
    if (files.length > 0) {
      setThemeFile(files[0]);
    }
  };

  const handleZipContent = (data: { thumb?: string; files?: string[] }) => {
    const { thumb } = data;
    if (thumb) {
      setScreenshot(thumb);
      setFileInfo({ 0: { preview: thumb } });
    }
  };

  const handleImageChange = (files: File[]) => {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const thumb = e.target?.result as string;
        setThemeImages((prev) => {
          const exists = prev.some(img => img.name === file.name && img.thumb === thumb);
          if (exists) {
            return prev;
          }
          return [...prev, { name: file.name, thumb }];
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setThemeImages((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleApprove = () => {
    setValue('approved', !watchedApproved);
  };

  const onSubmit = async (data: ThemeFormData) => {
    if (!data.categories || data.categories.length === 0) {
      showError('Validation Error', 'Please select at least one category');
      return;
    }

    if (!theme?._id && !themeFile) {
      showError('Validation Error', 'Please upload a theme ZIP file');
      return;
    }

    setProcessing(true);
    showLoading(translations.processing);

    try {
      const formData = {
        ...data,
        themeImages,
        screenshot,
        _id: theme?._id,
        documentId: theme?.documentId,
      };

      let response;

      if (themeFile) {
        response = await apiService.uploadThemeFile(
          themeFile,
          formData,
          (progress) => {
            setProgress(progress);
            updateLoadingProgress(`${progress}%`);
          }
        );
      } else {
        if (theme?._id) {
          response = await apiService.updateTheme(theme._id, formData);
        } else {
          response = await apiService.addTheme(formData);
        }
      }
      
      if (response.error) {
        hideLoading();
        showError(translations.oops_error, response.error);
        setProcessing(false);
        return;
      }
      
      const responseData = response.data;
      const isSuccess = responseData?.success !== false && responseData !== null && responseData !== undefined;
      
      if (!isSuccess || !responseData) {
        hideLoading();
        showError(translations.oops_error, 'Upload completed but theme was not saved. Please check the response.');
        setProcessing(false);
        return;
      }
      
      if (responseData.success === false) {
        hideLoading();
        const errorMsg = responseData.message || responseData.error || 'Upload failed on server';
        showError(translations.oops_error, errorMsg);
        setProcessing(false);
        return;
      }
      
      hideLoading();
      showSuccess(translations.success, translations.upload_completed);
      setProcessing(false);
      onSave();
    } catch (error: any) {
      hideLoading();
      showError(translations.oops_error, error.message);
      setProcessing(false);
    }
  };

  const selectedCategories = themeCategories.filter((c) => c.active && c.value !== null);

  // Auto-resize textarea component
  const AutoResizeTextarea = ({ minRows = 1, maxRows = 10, className = '', ...props }: any) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { ref, ...registerProps } = props;

    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const adjustHeight = () => {
        textarea.style.height = 'auto';
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
        const minHeight = lineHeight * minRows;
        const maxHeight = lineHeight * maxRows;
        const scrollHeight = textarea.scrollHeight;
        
        if (scrollHeight < minHeight) {
          textarea.style.height = `${minHeight}px`;
        } else if (scrollHeight > maxHeight) {
          textarea.style.height = `${maxHeight}px`;
          textarea.style.overflowY = 'auto';
        } else {
          textarea.style.height = `${scrollHeight}px`;
          textarea.style.overflowY = 'hidden';
        }
      };

      adjustHeight();
      textarea.addEventListener('input', adjustHeight);
      return () => textarea.removeEventListener('input', adjustHeight);
    }, [minRows, maxRows, props.value]);

    return <textarea ref={(e) => { textareaRef.current = e; if (ref) ref(e); }} className={className} {...registerProps} />;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !processing) {
          onCancel();
        }
      }}
    >
      <div 
        className="flex w-full max-w-4xl max-h-[90vh] flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">
            {theme?._id ? 'Edit Theme' : 'Add New Theme'}
          </h2>
          <button
            onClick={onCancel}
            disabled={processing}
            className="text-slate-400 transition-colors hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 min-h-0 flex-col gap-6 p-6">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
          {/* File Upload */}
          <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-300">
            {theme?._id ? 'Theme Screenshot' : translations.upload_theme_zip}
          </label>
          <div className="flex items-center justify-center overflow-x-auto">
            {!theme?._id ? (
              <FileUpload
                accept="application/zip"
                maxFiles={1}
                onFileChange={handleFileChange}
                onZipContent={handleZipContent}
                fileInfo={fileInfo}
                placeholder={translations.zip_file}
                disabled={processing}
              />
            ) : (
              <div className="flex h-[100px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-800/50">
                <img src={screenshot || theme?.thumb} alt="Theme thumbnail" className="max-h-full max-w-full object-cover" />
              </div>
            )}
            {(watch('themeName') || themeFile) && (
              <FileUpload
                accept="image/*"
                maxFiles={4}
                onFileChange={handleImageChange}
                existingFiles={themeImages}
                onRemoveFile={handleRemoveImage}
                placeholder={translations.add_image}
                disabled={processing}
              />
            )}
          </div>
        </div>

          {/* Theme Name */}
          <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className={`text-sm font-semibold ${errors.themeName ? 'text-rose-400' : 'text-slate-300'}`}>
              {translations.theme_name} <span className="text-rose-400">*</span>
            </label>
            {isMesDohThemeAdmin && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="approved"
                  checked={watchedApproved || false}
                  onChange={toggleApprove}
                  className="hidden"
                />
                <label
                  htmlFor="approved"
                  className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-2 transition-colors ${
                    watchedApproved ? 'border-emerald-500 bg-emerald-500' : 'border-emerald-500 bg-slate-800'
                  }`}
                  onClick={toggleApprove}
                >
                  {watchedApproved && <Check className="h-4 w-4 text-white" />}
                </label>
                <span onClick={toggleApprove} className="cursor-pointer text-sm text-slate-300">
                  {translations.approve}
                </span>
              </div>
            )}
          </div>
          <input
            type="text"
            {...register('themeName', { required: true })}
            placeholder={translations.enter_theme_name}
            className={`w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
              errors.themeName ? 'border-rose-500' : ''
            }`}
            disabled={processing}
          />
        </div>

          {/* Categories and Price */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={`text-sm font-semibold ${errors.categories ? 'text-rose-400' : 'text-slate-300'}`}>
              {translations.categories} <span className="text-rose-400">*</span>
            </label>
            <FilterDropdown
              options={themeCategories}
              onSelectionChange={handleCategoryChange}
              placeholder={`-- ${translations.categories} --`}
            />
            {selectedCategories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedCategories.map((cat) => (
                  <span key={cat.value} className="rounded-full bg-slate-800/50 px-3 py-1 text-sm text-slate-300">
                    {cat.title}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className={`text-sm font-semibold ${errors.themePrice ? 'text-rose-400' : 'text-slate-300'}`}>
              {translations.theme_price} <span className="text-rose-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                {...register('themePrice', { required: true, min: 0 })}
                placeholder={translations.enter_theme_price}
                className={`flex-1 rounded-l-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                  errors.themePrice ? 'border-rose-500' : ''
                }`}
                disabled={processing}
              />
              <CurrencySelector
                value={watchedCurrency || TOPUP_CURRENCIES[0]}
                onChange={(currency) => {
                  setValue('currency', currency);
                  addCurrency(currency);
                }}
                currencies={currencies}
                disabled={processing}
              />
            </div>
          </div>
        </div>

          {/* Intro Text */}
          <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-300">{translations.intro_text}</label>
          <AutoResizeTextarea
            {...register('introText')}
            placeholder={translations.intro_text}
            className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none overflow-hidden"
            minRows={1}
            maxRows={6}
            disabled={processing}
          />
        </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-300">{translations.description}</label>
          <AutoResizeTextarea
            {...register('description')}
            placeholder={translations.description}
            className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none overflow-hidden"
            minRows={5}
            maxRows={20}
            disabled={processing}
          />
          </div>
          </div>

          {/* Form Actions */}
          <div className="flex-shrink-0 flex justify-center gap-4 border-t border-slate-800 pt-4">
          {processing ? (
            <button type="button" className="min-w-[150px] rounded-md bg-slate-800/50 px-6 py-3 text-sm font-medium text-slate-400" disabled>
              {progress > 0 && <span>{progress}% </span>}
              {translations.processing}
            </button>
          ) : (
            <>
              <button type="button" className="min-w-[150px] rounded-md border border-slate-700 bg-transparent px-6 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white" onClick={onCancel}>
                {translations.cancel}
              </button>
              <button type="submit" className="min-w-[150px] rounded-md bg-brand px-6 py-3 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90">
                {translations.save}
              </button>
            </>
          )}
        </div>
      </form>
      </div>
    </div>
  );
}

