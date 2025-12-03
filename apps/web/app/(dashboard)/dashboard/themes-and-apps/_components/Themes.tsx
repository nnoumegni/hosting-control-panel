'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, CreditCard, CloudUpload, MoreVertical, ArrowRight, RefreshCw } from 'lucide-react';
import { Theme, apiService } from '../_services/api.service';
import { storageService } from '../_services/storage.service';
import { THEME_CATEGORIES, TOPUP_CURRENCIES } from '../_constants/theme-categories';
import { translations } from '../_constants/translations';
import { FilterDropdown } from './FilterDropdown';
import { ActionPopover } from './ActionPopover';
import { PriceLabel } from './PriceLabel';
import { Loader } from './Loader';
import { AddTheme } from './AddTheme';
import {
  showSuccess,
  showError,
  showLoading,
  hideLoading,
  confirmDelete,
  downloadFile,
  openBrowser,
  preloadImage,
  uniqBy,
} from '../_utils/utils';

interface ThemesProps {
  selectedItem?: any;
  memberID?: number;
  token?: string;
  org?: string;
  isMesDohThemeAdmin?: boolean;
}

export function Themes({
  selectedItem = {},
  memberID = 1,
  token = 'mock-token',
  org = 'test-org',
  isMesDohThemeAdmin = false,
}: ThemesProps) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [allThemes, setAllThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTab, setLoadingTab] = useState(false);
  const [selectedTab, setSelectedTab] = useState('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddTheme, setShowAddTheme] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [themeFilters, setThemeFilters] = useState(
    [{ value: null, title: translations.show_all, active: true, key: 'all_themes' }, ...THEME_CATEGORIES]
  );
  const [thumbLoaded, setThumbLoaded] = useState<Record<string, string>>({});

  const tabs = [
    { name: translations.latest, uri: 'latest' },
    { name: translations.my_themes, uri: 'myThemes' },
    { name: translations.my_orders, uri: 'myOrders' },
    ...(isMesDohThemeAdmin ? [{ name: translations.pendingApproval, uri: 'pendingApproval' }] : []),
  ];

  const loadThemes = useCallback(async () => {
    setLoadingTab(true);
    try {
      // Check for cached approved themes in window.MESDOH_THEMES (matching Angular pattern)
      const cachedApprovedThemes = typeof window !== 'undefined' ? (window as any).MESDOH_THEMES : undefined;
      let approvedThemesResponse;

      if (cachedApprovedThemes && cachedApprovedThemes.length) {
        approvedThemesResponse = { data: { themes: cachedApprovedThemes }, error: undefined };
      } else {
        approvedThemesResponse = await apiService.getApprovedThemes();
      }

      let orgThemesResponse;
      if (memberID) {
        orgThemesResponse = await apiService.getOrgThemes();
      } else {
        orgThemesResponse = { data: { themes: [] }, error: undefined };
      }

      if (approvedThemesResponse.error && orgThemesResponse.error) {
        showError(translations.oops_error, approvedThemesResponse.error);
        setThemes([]);
        setAllThemes([]);
      }

      const { themes: approvedThemes = [] } = approvedThemesResponse.data || {};
      const { themes: orgThemes = [] } = orgThemesResponse.data || {};

      const allThemes = uniqBy([...approvedThemes, ...orgThemes], '_id');

      await storageService.storeThemes(allThemes);

      const sorted = allThemes.sort((a, b) => {
        if (a._id === selectedItem.themeId) return -1;
        if (b._id === selectedItem.themeId) return 1;
        return 0;
      });

      setAllThemes(sorted);
      setThemes(sorted);
      
      const initialThumbs: Record<string, string> = {};
      sorted.forEach((theme) => {
        if (theme._id && theme.thumb) {
          initialThumbs[theme._id] = theme.thumb;
        }
      });
      setThumbLoaded(initialThumbs);
      
      setLoading(false);
      setLoadingTab(false);
      
      // Preload images in background
      for (const theme of sorted) {
        if (theme.thumb) {
          try {
            await preloadImage(theme.thumb);
          } catch (e) {
            // Image failed to preload - ignore
          }
        }
      }
    } catch (error: any) {
      showError(translations.oops_error, error.message);
    } finally {
      setLoading(false);
      setLoadingTab(false);
    }
  }, [token, memberID, org, selectedItem.themeId]);

  useEffect(() => {
    apiService.setAuth(token, memberID, org);
    loadThemes();
  }, [token, memberID, org, loadThemes]);

  const applyTabFilter = useCallback(() => {
    let filtered = [...allThemes];

    switch (selectedTab) {
      case 'latest':
        filtered = filtered.filter((t) => t.approved);
        break;
      case 'myThemes':
        filtered = filtered.filter((t) => parseInt(String(t.mid), 10) === memberID);
        break;
      case 'myOrders':
        filtered = filtered.filter((t) => parseInt(String(t.mid), 10) === memberID);
        break;
      case 'pendingApproval':
        filtered = filtered.filter((t) => !t.approved);
        break;
    }

    setThemes(filtered);
  }, [allThemes, selectedTab, memberID]);

  const filterThemes = useCallback(async () => {
    const selectedFilters = themeFilters.filter((f) => f.active && f.value !== null);
    const categories = selectedFilters.map((f) => f.value!);

    if (categories.length > 0 || searchQuery.trim()) {
      const filtered = await storageService.searchThemes(searchQuery, categories);
      setThemes(filtered);
    } else {
      applyTabFilter();
    }
  }, [searchQuery, themeFilters, applyTabFilter]);

  useEffect(() => {
    filterThemes();
  }, [filterThemes]);

  const handleFilterChange = useCallback((selected: any[]) => {
    const updated = themeFilters.map((filter) => {
      const found = selected.find((s) => s.value === filter.value);
      return { 
        ...filter, 
        active: found ? true : filter.value === null ? true : false 
      };
    });
    setThemeFilters(updated);
  }, []);

  const canDeploy = useCallback((theme: Theme) => {
    const isFree = parseFloat(String(theme.themePrice || 0)) <= 0;
    const isOwner = parseInt(String(theme.mid), 10) === memberID;
    return isFree || isOwner;
  }, [memberID]);

  const getThemeActions = useCallback((theme: Theme, index: number) => {
    const actions: any[] = [
      {
        title: translations.details,
        value: 'details',
        onClick: () => goToTheme(theme),
      },
      {
        title: translations.preview,
        value: 'preview',
        onClick: () => previewTheme(theme),
      },
    ];

    if (!canDeploy(theme)) {
      actions.push({
        title: translations.buy_now,
        value: 'buy',
        onClick: () => buyTheme(theme),
      });
    } else {
      actions.push({
        title: translations.download,
        value: 'download',
        onClick: () => downloadTheme(theme),
      });
    }

    if (parseInt(String(theme.mid), 10) === memberID || isMesDohThemeAdmin) {
      actions.push(
        {
          title: translations.deploy,
          value: 'deploy',
          onClick: () => deployTheme(theme),
        },
        {
          title: translations.edit,
          value: 'edit',
          onClick: () => editTheme(theme),
        },
        {
          title: translations.delete,
          value: 'delete',
          onClick: () => handleDeleteTheme(theme),
        }
      );
    }

    return actions;
  }, [memberID, isMesDohThemeAdmin]);

  const goToTheme = useCallback((theme: Theme) => {
    console.log('Navigate to theme:', theme._id);
  }, []);

  const previewTheme = useCallback((theme: Theme) => {
    if (theme.previewUrl) {
      openBrowser(theme.previewUrl);
    }
  }, []);

  const buyTheme = useCallback((theme: Theme) => {
    console.log('Buy theme:', theme);
  }, []);

  const downloadTheme = useCallback(async (theme: Theme) => {
    if (!theme._id) return;

    showLoading(translations.processing);
    try {
      const response = await apiService.downloadTheme(theme._id);
      if (response.error) {
        hideLoading();
        showError(translations.oops_error, response.error);
      } else if (response.data?.themeUrl) {
        downloadFile(response.data.themeUrl, `${theme.themeName}.zip`);
        hideLoading();
        showSuccess(translations.success, translations.download);
      }
    } catch (error: any) {
      hideLoading();
      showError(translations.oops_error, error.message);
    }
  }, []);

  const deployTheme = useCallback((theme: Theme) => {
    console.log('Deploy theme:', theme);
  }, []);

  const editTheme = useCallback((theme: Theme) => {
    setEditingTheme(theme);
    setShowAddTheme(true);
  }, []);

  const handleDeleteTheme = useCallback(async (theme: Theme) => {
    const confirmed = await confirmDelete(theme.themeName);
    if (!confirmed || !theme._id) return;

    showLoading(translations.processing);
    try {
      const response = await apiService.deleteTheme(theme._id);
      if (response.error) {
        hideLoading();
        showError(translations.oops_error, response.error);
      } else {
        hideLoading();
        showSuccess(translations.success, translations.theme_deleted);
        loadThemes();
      }
    } catch (error: any) {
      hideLoading();
      showError(translations.oops_error, error.message);
    }
  }, [loadThemes]);

  const handleThemeAdded = useCallback(() => {
    setShowAddTheme(false);
    setEditingTheme(null);
    loadThemes();
  }, [loadThemes]);

  return (
    <>
      {showAddTheme && (
        <AddTheme
          theme={editingTheme || undefined}
          onSave={handleThemeAdded}
          onCancel={() => {
            setShowAddTheme(false);
            setEditingTheme(null);
          }}
          memberID={memberID}
          token={token}
          org={org}
          isMesDohThemeAdmin={isMesDohThemeAdmin}
        />
      )}
    <div>
      {/* Header with filters and add button */}
      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <FilterDropdown
              options={themeFilters}
              onSelectionChange={handleFilterChange}
              placeholder={translations.show_all}
            />
            <span className="text-2xl text-slate-500">/</span>
            <button
              className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
              onClick={() => setShowAddTheme(true)}
            >
              <Plus className="h-4 w-4" />
              <span>{translations.add}</span>
              <span>{translations.new}</span>
            </button>
          </div>
          <button
            onClick={() => loadThemes()}
            className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loadingTab}
            title="Refresh themes"
          >
            <RefreshCw className={`h-4 w-4 ${loadingTab ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Tabs */}
        <ul className="flex gap-2 border-b border-slate-800">
          {tabs.map((tab) => (
            <li
              key={tab.uri}
              className={`cursor-pointer border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
                selectedTab === tab.uri
                  ? 'border-sky-500 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
              onClick={() => setSelectedTab(tab.uri)}
            >
              {tab.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Theme List */}
      {loadingTab ? (
        <Loader />
      ) : (
        <div>
          {themes.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-16 text-center">
              <p className="text-slate-400">No themes found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {themes.map((theme, index) => (
                <div
                  key={theme._id || index}
                  className={`rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition-all hover:border-slate-700 hover:bg-slate-900/70 ${
                    selectedItem.themeId === theme._id ? 'ring-2 ring-sky-500 border-sky-500/50' : ''
                  }`}
                >
                  <figure
                    className="mb-4 h-[200px] w-full cursor-pointer overflow-hidden rounded-lg"
                    onClick={() => goToTheme(theme)}
                  >
                    {thumbLoaded[theme._id || ''] ? (
                      <img
                        src={thumbLoaded[theme._id || '']}
                        alt={theme.themeName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-800/50">
                        <Loader />
                      </div>
                    )}
                  </figure>

                  <div>
                    <h3 
                      className="mb-2 flex items-center gap-2 text-lg font-semibold text-white cursor-pointer hover:text-sky-300 transition-colors"
                      onClick={() => goToTheme(theme)}
                    >
                      {selectedItem.themeId === theme._id && (
                        <span className="text-emerald-400">✓</span>
                      )}
                      {theme.themeName}
                    </h3>

                    <div className="mb-4 flex items-center justify-between border-t border-slate-800 pt-4">
                      <div>
                        {theme.themePrice && theme.currency ? (
                          <PriceLabel
                            price={theme.themePrice}
                            currency={theme.currency}
                          />
                        ) : (
                          <span className="font-bold text-emerald-400">{translations.free}!</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {theme.themePrice > 0 && (
                          <button
                            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                            onClick={() => buyTheme(theme)}
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            <span>{translations.buy}</span>
                          </button>
                        )}
                        {theme.themePrice === 0 && (
                          <button
                            className="flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white"
                            onClick={() => deployTheme(theme)}
                          >
                            <CloudUpload className="h-3.5 w-3.5" />
                            <span>{translations.deploy}</span>
                          </button>
                        )}

                        <ActionPopover
                          actions={getThemeActions(theme, index)}
                        />
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                      <button
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 transition-colors hover:bg-sky-500/20 hover:border-sky-500/50"
                        onClick={() => previewTheme(theme)}
                      >
                        {translations.live_demo}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

