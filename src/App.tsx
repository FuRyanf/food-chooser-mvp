import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { DollarSign, Egg, Filter, History, Info, Moon, Search, Sparkles, Sun, Trash2, Languages, LogOut, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import EggGacha from "./components/EggGacha";
import { FoodChooserAPI } from './lib/api';
import type { Database } from './lib/supabase';
import { createPortal } from 'react-dom';
import { Language, translateTemplate, translateText } from './lib/i18n';
import crackedEggImg from '../image cracked egg.png';
import { AuthenticatedApp } from './components/AuthenticatedApp';
import { useAuth } from './contexts/AuthContext';
import { useProfile } from './contexts/ProfileContext';
import { HouseholdSettings } from './components/HouseholdSettings';
import HouseholdOnboarding from './components/HouseholdOnboarding';
import InviteAccept from './components/InviteAccept';

type Meal = Database['public']['Tables']['meals']['Row'];
type MealInsert = Database['public']['Tables']['meals']['Insert'];
type Weather = { condition: 'hot'|'cold'|'mild'|'rain'; tempF: number };
type Budget = { min: number; max: number };
type EggTier = 'Bronze'|'Silver'|'Gold'|'Diamond';
type Recommendation = {
  key: string;
  label: string;
  suggestedRestaurant?: string;
  dish?: string;
  estCost: number;
  score: number;
  tier: EggTier;
};

type Overrides = Record<string, number>;

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger';
};

const currency = (n:number)=> `$${n.toFixed(2)}`;

const THEME_STORAGE_KEY = 'fudi.theme';
const LANGUAGE_STORAGE_KEY = 'fudi.language';

function resolveInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function resolveInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  const locale = window.navigator.language.toLowerCase();
  return locale.startsWith('zh') ? 'zh' : 'en';
}

// Los Angeles timezone helpers
function toLocalDate(dateString: string): Date {
  // Create date in local timezone (PST/PDT) rather than UTC
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

function toLocalISOString(dateString: string): string {
  // Convert date string to ISO string representing noon local time to avoid timezone shifts
  const [year, month, day] = dateString.split('-').map(Number);
  const localDate = new Date(year, month - 1, day, 12, 0, 0); // Set to noon local time
  return localDate.toISOString();
}

function getLocalMonthKey(dateString: string): string {
  // Get month key using local timezone parsing
  const [year, month, day] = dateString.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  return `${localDate.getFullYear()}-${String(localDate.getMonth()+1).padStart(2,'0')}`;
}

const todayISO = ()=> new Date().toISOString().slice(0,10);
const daysSince = (iso:string)=> Math.max(0, Math.floor((Date.now()-new Date(iso).getTime())/86400000));
// Markers to flag seeded meals (logged without a real date) so we can exclude from spend
const SEED_TAG = '[SEED]';
const isSeedMeal = (m: Meal)=> (m as any).seed_only === true || ((m.notes ?? '') as string).includes(SEED_TAG);
// Precise weather: we will fetch current weather from Open-Meteo using geolocation.
function mapWeatherCodeToCondition(code: number, tempF: number): Weather['condition'] {
  const rainyCodes = new Set<number>([
    51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99
  ]);
  if (rainyCodes.has(code)) return 'rain';
  if (tempF >= 85) return 'hot';
  if (tempF <= 58) return 'cold';
  return 'mild';
}
async function fetchWeather(lat:number, lon:number): Promise<Weather>{
  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.warn('Weather API returned non-OK status:', res.status);
      throw new Error('Weather API failed');
    }
    
    const data = await res.json();
    const t = Number(data?.current_weather?.temperature ?? 70);
    const code = Number(data?.current_weather?.weathercode ?? 0);
    const condition = mapWeatherCodeToCondition(code, t);
    return { condition, tempF: t };
  } catch (err) {
    console.log('Weather API unavailable, using defaults');
    // Return default mild weather
    return { condition: 'mild', tempF: 70 };
  }
}
async function reverseGeocode(lat:number, lon:number): Promise<string | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const first = data?.results?.[0];
    if (!first) return null;
    // Prefer just the city/locality name
    return first.name || null;
  } catch { return null; }
}
async function ipCityFallback(): Promise<string | null> {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    const city = data?.city as string | undefined;
    return city ?? null;
  } catch { return null; }
}
function pseudoWeatherFallback(): Weather {
  const t = 72;
  return { condition: 'mild', tempF: t };
}
function deriveTier(cost:number): EggTier { if (cost<15) return 'Bronze'; if (cost<30) return 'Silver'; if (cost<55) return 'Gold'; return 'Diamond'; }

const seedMeals: Omit<MealInsert, 'user_id' | 'created_at' | 'updated_at'>[] = [
  { date: new Date(Date.now()-86400000*6).toISOString(), cuisine:'Mexican', dish:'Chipotle Bowl', restaurant:'Chipotle', cost:14.5, rating:4, notes: null, seed_only: false, purchaser_name: 'Unknown' },
  { date: new Date(Date.now()-86400000*5).toISOString(), cuisine:'Japanese', dish:'Salmon Poke', restaurant:'Poke House', cost:19.2, rating:5, notes: null, seed_only: false, purchaser_name: 'Unknown' },
  { date: new Date(Date.now()-86400000*3).toISOString(), cuisine:'Italian', dish:'Margherita Pizza', restaurant:"Tony's", cost:24.0, rating:4, notes: null, seed_only: false, purchaser_name: 'Unknown' },
  { date: new Date(Date.now()-86400000*2).toISOString(), cuisine:'American', dish:'Smash Burger', restaurant:'Burger Bros', cost:16.0, rating:3, notes: null, seed_only: false, purchaser_name: 'Unknown' },
  { date: new Date(Date.now()-86400000*1).toISOString(), cuisine:'Thai', dish:'Pad See Ew', restaurant:'Thai Basil', cost:18.5, rating:5, notes: null, seed_only: false, purchaser_name: 'Unknown' },
];

function buildRecommendations(
  meals: Meal[],
  budget: Budget,
  forbidRepeatDays = 1,
  overrides: Overrides = {},
  enforceNoRepeat = true,
  weather: Weather
) {
  if (!meals.length) return [] as Recommendation[];
  const byCuisine = new Map<string, Meal[]>();
  for (const m of meals) { const k = m.cuisine.trim(); if (!byCuisine.has(k)) byCuisine.set(k, []); byCuisine.get(k)!.push(m); }
  const recs: Recommendation[] = [];
  for (const [cuisine, arr] of byCuisine.entries()) {
    const sorted = [...arr].sort((a,b)=> +new Date(b.date) - +new Date(a.date));
    const last = sorted[0];
    const avgRating = arr.reduce((s,m)=> s + (m.rating ?? 3), 0)/arr.length;
    const lastCost = last.cost; // latest price
    const lastDays = daysSince(last.date);
    // Enforce no-repeat only if opted-in and window > 0
    if (enforceNoRepeat && forbidRepeatDays > 0 && lastDays <= forbidRepeatDays) continue;
    const recencyPenalty = Math.max(-8, -1 * (6 - Math.min(6, lastDays)));
    const within = lastCost >= budget.min && lastCost <= budget.max;
    const budgetFit = within ? 12 : -Math.min(Math.abs(lastCost - (lastCost < budget.min ? budget.min : budget.max))/5, 10);
    const todayWx = weather;
    let weatherBonus = 0;
    if (todayWx.condition==='hot' && ['Japanese','Salad','Mexican'].includes(cuisine)) weatherBonus += 3;
    if (todayWx.condition==='cold' && ['Ramen','Indian','Italian'].includes(cuisine)) weatherBonus += 4;
    if (todayWx.condition==='rain' && ['Pho','Ramen','Curry'].includes(cuisine)) weatherBonus += 5;
    const last30 = arr.filter(m => daysSince(m.date) <= 30).length;
    const trend = last30 >= 2 && avgRating >= 4 ? 5 : 0;

    const overrideBonus = (overrides[cuisine] ?? 0) * 3;

    const score = (avgRating * 6) + recencyPenalty + budgetFit + weatherBonus + trend + overrideBonus;

    recs.push({
      key: cuisine,
      label: cuisine,
      suggestedRestaurant: last.restaurant ?? undefined,
      dish: last.dish,
      estCost: lastCost,
      score,
      tier: deriveTier(lastCost)
    });
  }
  return recs.filter(x=> x.estCost>=budget.min && x.estCost<=budget.max).sort((a,b)=> b.score - a.score);
}

// Detailed per-meal ranking breakdown (documented)
// score = ratingWeight + recencyPenalty + budgetFit + weatherBonus + jitter
// - ratingWeight: (rating || 3) * 10
// - recencyPenalty: max(-12, -1 * (20 - min(20, daysSince)))
// - budgetFit: +8 if within, else -((distance)/4) capped at -12
// - weatherBonus: small cuisine-based bonus
// - jitter: uniform in [-1.5, 1.5]
function computeMealScoreBreakdown(meal: Meal, budget: Budget, today: Weather) {
  const ratingWeight = (meal.rating ?? 3) * 10;
  const ds = daysSince(meal.date);
  const recencyPenalty = Math.max(-12, -1 * (20 - Math.min(20, ds)));
  const within = meal.cost >= budget.min && meal.cost <= budget.max;
  const budgetFit = within ? 8 : -Math.min(Math.abs(meal.cost - (meal.cost < budget.min ? budget.min : budget.max))/4, 12);
  let weatherBonus = 0;
  if (today.condition==='hot' && ['Japanese','Salad','Mexican'].includes(meal.cuisine)) weatherBonus += 2;
  if (today.condition==='cold' && ['Ramen','Indian','Italian'].includes(meal.cuisine)) weatherBonus += 3;
  if (today.condition==='rain' && ['Pho','Ramen','Curry'].includes(meal.cuisine)) weatherBonus += 3;
  const jitter = (Math.random()*3) - 1.5;
  const total = ratingWeight + recencyPenalty + budgetFit + weatherBonus + jitter;
  return { ratingWeight, recencyPenalty, budgetFit, weatherBonus, jitter, total };
}

export default function App() {
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if this is an invite link
    const path = window.location.pathname;
    const match = path.match(/^\/invite\/([a-zA-Z0-9_-]+)$/);
    if (match) {
      setInviteToken(match[1]);
    }
  }, []);

  // If there's an invite token in the URL, show InviteAccept
  if (inviteToken) {
    return (
      <AuthenticatedApp>
        <InviteAccept 
          inviteToken={inviteToken} 
          onAccepted={() => {
            // Clear invite token and redirect to home
            setInviteToken(null);
            window.history.pushState({}, '', '/');
            window.location.reload();
          }} 
        />
      </AuthenticatedApp>
    );
  }

  return (
    <AuthenticatedApp>
      <AppRouter />
    </AuthenticatedApp>
  );
}

function AppRouter() {
  const { user, needsOnboarding, householdId, refreshHousehold } = useAuth();

  // If user is authenticated but needs onboarding (no household)
  if (user && needsOnboarding && !householdId) {
    return (
      <HouseholdOnboarding
        userId={user.id}
        onComplete={() => {
          refreshHousehold();
        }}
      />
    );
  }

  // Normal app flow
  return <MainApp />;
}

function MainApp() {
  const { householdId, user, signOut, householdName } = useAuth();
  const { displayName } = useProfile();
  const [meals, setMeals] = useState<Meal[]>([]);
  // Saved preferences used by computation
  const [budgetSaved, setBudgetSaved] = useState<Budget>({ min: 10, max: 35 });
  const [forbidRepeatDaysSaved, setForbidRepeatDaysSaved] = useState(1);
  // Draft UI state for editing preferences
  const [budgetDraft, setBudgetDraft] = useState<{ min: string; max: string }>({ min: '10', max: '35' });
  const [forbidRepeatDaysDraft, setForbidRepeatDaysDraft] = useState<string>('1');
  const [search, setSearch] = useState('');
  const [eggOpen, setEggOpen] = useState(false);
  const [picked, setPicked] = useState<Recommendation | undefined>();
  const [overrides, setOverrides] = useState<Overrides>({});
  const [isOverride, setIsOverride] = useState(false);

  const [language, setLanguage] = useState<Language>(() => resolveInitialLanguage());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const initialTheme = resolveInitialTheme();
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', initialTheme === 'dark');
    }
    return initialTheme;
  });
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {/* ignore storage errors */}
  }, [theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch {/* ignore storage errors */}
  }, [language]);

  const t = useCallback((text: string) => translateText(text, language), [language]);
  const tt = useCallback((text: string, replacements: Record<string, string | number>) => translateTemplate(text, language, replacements), [language]);
  const appName = language === 'zh' ? '福娣' : 'FuDi';

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  const isDarkTheme = theme === 'dark';

  const navButtons: Array<{ key: 'home' | 'browse' | 'contributions' | 'household'; label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = [
    { key: 'home', label: t('Home'), icon: Sparkles, description: t('Mystery picks & logging') },
    { key: 'browse', label: t('Browse'), icon: Search, description: t('Browse your saved meals') },
    { key: 'contributions', label: t('Contributions'), icon: DollarSign, description: t('Track spending & contributions') },
    { key: 'household', label: t('Household'), icon: Users, description: t('Manage household settings') },
  ];

  const panelClass = 'rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-amber-100/40 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/70 dark:shadow-emerald-500/10';
  const glassCardClass = 'rounded-2xl border border-white/50 bg-white/70 p-4 shadow-sm shadow-amber-100/30 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/60';
  const rangeButtonClass = (active: boolean) => active
    ? 'rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow shadow-emerald-400/50'
    : 'rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-white/90 dark:border-white/10 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800/80';

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const confirmResolverRef = useRef<((choice: boolean) => void) | null>(null);

  const closeConfirm = useCallback((choice: boolean) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(choice);
      confirmResolverRef.current = null;
    }
    setConfirmDialog(null);
  }, []);

  const requestConfirm = useCallback((config: ConfirmDialogState) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog(config);
    });
  }, []);

  useEffect(() => {
    if (!confirmDialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDialog, closeConfirm]);

  // Tabs: Home (default), Browse, Contributions, Household
  const [activeTab, setActiveTab] = useState<'home'|'browse'|'contributions'|'household'>('home');
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseHideDisabled, setBrowseHideDisabled] = useState(false);
  const [browseSort, setBrowseSort] = useState<'recent' | 'rating' | 'cost'>('recent');
  const [orderOpen, setOrderOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [scoreHelpOpen, setScoreHelpOpen] = useState(false);
  const [scoreHelpText, setScoreHelpText] = useState<string>('');


  // Edit history modal
  const [editMeal, setEditMeal] = useState<Meal | null>(null);
  const [editOriginal, setEditOriginal] = useState<Meal | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Cool-off map (restaurant|dish normalized) persisted locally
  const [coolOff, setCoolOff] = useState<Record<string, boolean>>({});
  const [coolSavingKey, setCoolSavingKey] = useState<string | null>(null);
  // Cuisine filter (UI-only; decoupled from disables)
  const [cuisineFilter, setCuisineFilter] = useState<Record<string, boolean>>({});
  const normalizeCuisine = (c:string)=> c.trim().toLowerCase();
  const [cuisineBatchSaving, setCuisineBatchSaving] = useState<boolean>(false);
  const [cuisineQuery, setCuisineQuery] = useState<string>('');
  // Groceries state
  type Grocery = Database['public']['Tables']['groceries']['Row'];
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [gDate, setGDate] = useState<string>(todayISO());
  const [gAmount, setGAmount] = useState<string>('50');
  const [gStore, setGStore] = useState<string>('');
  const [showStoreDropdown, setShowStoreDropdown] = useState<boolean>(false);
  const [selectedStoreIndex, setSelectedStoreIndex] = useState<number>(-1);
  const [editGrocery, setEditGrocery] = useState<Grocery | null>(null);
  useEffect(() => {
    // Load disabled items from Supabase
    (async () => {
      try {
        const map = await FoodChooserAPI.getDisabledItems(householdId!);
        setCoolOff(map);
      } catch (e) {
        // fallback to local cache if present
        try { const raw = localStorage.getItem('fudi.cooloff.v1'); if (raw) setCoolOff(JSON.parse(raw)); } catch {}
      }
    })();
    // Initialize cuisine filter defaults to all-on
    const all: Record<string, boolean> = {};
    meals.forEach(m => { const k = normalizeCuisine(m.cuisine); all[k] = true; });
    setCuisineFilter(prev => (Object.keys(prev).length ? { ...all, ...prev } : all));
  }, []);
  useEffect(() => { localStorage.setItem('fudi.cooloff.v1', JSON.stringify(coolOff)); }, [coolOff]);
  useEffect(() => {
    const all: Record<string, boolean> = {};
    meals.forEach(m => { const k = normalizeCuisine(m.cuisine); if (!(k in all)) all[k] = cuisineFilter[k] ?? true; });
    setCuisineFilter(prev => ({ ...all, ...prev }));
  }, [meals]);

  // Spend drilldown modal
  const [spendOpen, setSpendOpen] = useState(false);
  const [spendSelection, setSpendSelection] = useState<string | null>(null); // YYYY-MM
  const [spendWindowStart, setSpendWindowStart] = useState<string>(() => {
    const d = new Date();
    // start at current month - 5 for a 6-month window ending this month
    const start = new Date(d.getFullYear(), d.getMonth() - 5, 1);
    return `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`;
  });
  const [monthlyBudgetDraft, setMonthlyBudgetDraft] = useState<string>('');
  const [monthlyBudgetSaved, setMonthlyBudgetSaved] = useState<number | null>(null);
  const [monthlyBudgetEdit, setMonthlyBudgetEdit] = useState<boolean>(false);
  const quickStats = useMemo(() => [
    {
      label: t('Budget'),
      value: `${currency(budgetSaved.min)} – ${currency(budgetSaved.max)}`,
    },
    {
      label: t('Monthly budget'),
      value: monthlyBudgetSaved != null ? currency(monthlyBudgetSaved) : t('Not set'),
    },
    {
      label: t('Total entries'),
      value: tt('{meals} meals · {groceries} groceries', { meals: meals.length, groceries: groceries.length }),
    },
  ], [budgetSaved, monthlyBudgetSaved, meals, groceries, t, tt]);
  // Toast feedback
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  function showToast(message: string, durationMs = 2200) {
    setToast({ show: true, message });
    window.setTimeout(() => setToast({ show: false, message: '' }), durationMs);
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Prefs save state
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSavedNotice, setPrefsSavedNotice] = useState<string | null>(null);
  const isPrefsDirty = useMemo(() => {
    const minSaved = String(budgetSaved.min);
    const maxSaved = String(budgetSaved.max);
    const daysSaved = String(forbidRepeatDaysSaved);
    const mbSaved = monthlyBudgetSaved != null ? String(monthlyBudgetSaved) : '';
    return (
      budgetDraft.min.trim() !== minSaved ||
      budgetDraft.max.trim() !== maxSaved ||
      forbidRepeatDaysDraft.trim() !== daysSaved ||
      monthlyBudgetDraft.trim() !== mbSaved
    );
  }, [budgetDraft, forbidRepeatDaysDraft, monthlyBudgetDraft, budgetSaved, forbidRepeatDaysSaved, monthlyBudgetSaved]);

  // Compute egg tier eligibility from saved budget
  const eggEligibility = useMemo(() => {
    const min = budgetSaved.min;
    const max = budgetSaved.max;
    const intersects = (aMin:number, aMax:number, bMin:number, bMax:number)=> aMax >= bMin && bMax >= aMin;
    type Tier = { name:'Bronze'|'Silver'|'Gold'|'Diamond'; rangeLabel:string; rangeMin:number; rangeMax:number|null; eligible:boolean; badge:string; tip?:string };
    const tiersBase: Array<Omit<Tier,'eligible'|'badge'|'tip'>> = [
      { name: 'Bronze', rangeLabel: '< $15', rangeMin: 0, rangeMax: 15 },
      { name: 'Silver', rangeLabel: '$15 – $29.99', rangeMin: 15, rangeMax: 30 },
      { name: 'Gold', rangeLabel: '$30 – $54.99', rangeMin: 30, rangeMax: 55 },
      { name: 'Diamond', rangeLabel: '$55+', rangeMin: 55, rangeMax: null },
    ];
    const badgeByTier: Record<string, string> = {
      Bronze: 'border-amber-400 text-amber-700',
      Silver: 'border-zinc-400 text-zinc-700',
      Gold: 'border-yellow-500 text-yellow-700',
      Diamond: 'border-cyan-400 text-cyan-700',
    };
    const list: Tier[] = tiersBase.map(tb => {
      const eligible = tb.rangeMax === null
        ? max >= tb.rangeMin
        : intersects(min, max, tb.rangeMin, tb.rangeMax - 0.01);
      // Build a simple tip if not eligible
      let tip: string | undefined;
      if (!eligible) {
        if (max < tb.rangeMin) tip = `Increase Max to at least ${currency(tb.rangeMin)} to reach ${tb.name}.`;
        else if (tb.rangeMax !== null && min > tb.rangeMax - 0.01) tip = `Lower Min below ${currency(tb.rangeMax)} to reach ${tb.name}.`;
      }
      return { ...tb, eligible, badge: badgeByTier[tb.name], tip } as Tier;
    });
    return list;
  }, [budgetSaved]);

  useEffect(()=>{ loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [mealsData, prefsData, overridesData, groceriesData] = await Promise.all([
        FoodChooserAPI.getMeals(householdId!),
        FoodChooserAPI.getUserPreferences(householdId!),
        FoodChooserAPI.getOverridesMap(householdId!),
        FoodChooserAPI.getGroceries(householdId!)
      ]);
      setMeals(mealsData);
      setGroceries(groceriesData);
      if (prefsData) {
        const savedBudget = { min: prefsData.budget_min, max: prefsData.budget_max };
        setBudgetSaved(savedBudget);
        setForbidRepeatDaysSaved(prefsData.forbid_repeat_days);
        setBudgetDraft({ min: String(savedBudget.min), max: String(savedBudget.max) });
        setForbidRepeatDaysDraft(String(prefsData.forbid_repeat_days));
        setMonthlyBudgetSaved(prefsData.monthly_budget ?? null);
        setMonthlyBudgetDraft(prefsData.monthly_budget != null ? String(prefsData.monthly_budget) : '');
      }
      setOverrides(overridesData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally { setLoading(false); }
  }

  // Save preferences explicitly with validation
  async function savePreferences() {
    setPrefsError(null);
    setPrefsSavedNotice(null);
    const min = Number(budgetDraft.min);
    const max = Number(budgetDraft.max);
    const days = Number(forbidRepeatDaysDraft);
    const monthlyBudget = monthlyBudgetDraft.trim() ? Number(monthlyBudgetDraft) : null;
    if (!isFinite(min) || !isFinite(max)) { setPrefsError(t('Please enter valid numeric min and max.')); return; }
    if (min < 0 || max < 0) { setPrefsError(t('Min and Max must be non-negative.')); return; }
    if (max < min) { setPrefsError(t('Max must be greater than or equal to Min.')); return; }
    if (!Number.isInteger(days) || days < 0 || days > 14) { setPrefsError(t('No repeat within days must be an integer between 0 and 14.')); return; }
    if (monthlyBudget !== null && (!isFinite(monthlyBudget) || monthlyBudget < 0)) { setPrefsError(t('Monthly budget must be a non-negative number.')); return; }
    try {
      setPrefsSaving(true);
      const saved = await FoodChooserAPI.upsertUserPreferences(householdId!, {
        budget_min: min,
        budget_max: max,
        forbid_repeat_days: days,
        strict_budget: true,
        monthly_budget: monthlyBudget
      });
      setBudgetSaved({ min: saved.budget_min, max: saved.budget_max });
      setForbidRepeatDaysSaved(saved.forbid_repeat_days);
      setMonthlyBudgetSaved(saved.monthly_budget ?? null);
      setPrefsSavedNotice(t('Preferences saved.'));
    } catch (e) {
      console.error('Failed to save preferences', e);
      setPrefsError(t('Failed to save preferences.'));
    } finally {
      setPrefsSaving(false);
    }
  }

  const cuisines = useMemo(()=> [...new Set(meals.map(m=>m.cuisine))], [meals]);
  const [wx, setWx] = useState<Weather>(pseudoWeatherFallback());
  const [locationName, setLocationName] = useState<string>('');
  useEffect(() => {
    const fallback = async () => {
      const lat = 37.7749, lon = -122.4194;
      try { const w = await fetchWeather(lat, lon); setWx(w); } catch { setWx(pseudoWeatherFallback()); }
      try {
        const name = await reverseGeocode(lat, lon);
        if (name) setLocationName(name);
        else {
          const ipCity = await ipCityFallback();
          setLocationName(ipCity ?? 'San Francisco');
        }
      } catch {
        const ipCity = await ipCityFallback();
        setLocationName(ipCity ?? 'San Francisco');
      }
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos)=>{
          // Fetch weather (has its own timeout and fallback now)
          const w = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
          setWx(w);
          
          // Try to get location name (non-blocking)
          try {
            const name = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            if (name) {
              setLocationName(name);
            } else {
              const ipCity = await ipCityFallback();
              setLocationName(ipCity ?? 'City unavailable');
            }
          } catch {
            const ipCity = await ipCityFallback();
            setLocationName(ipCity ?? 'City unavailable');
          }
        },
        ()=> fallback(),
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
      );
    } else { fallback(); }
  }, []);
  const recs = useMemo(()=> buildRecommendations(meals, budgetSaved, forbidRepeatDaysSaved, overrides, true, wx), [meals, budgetSaved, forbidRepeatDaysSaved, overrides, wx]);
  const filteredRecs = recs.filter(r=> r.label.toLowerCase().includes(search.toLowerCase()));

  function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  const totalSpendCurrentMonth = useMemo(()=>{
    const nowKey = monthKey(new Date());
    const mealsSum = meals
      .filter(m=> !isSeedMeal(m))
      .filter(m=> {
        // Use local month key for stored ISO dates
        const storedMonthKey = getLocalMonthKey(m.date.slice(0,10));
        return storedMonthKey === nowKey;
      })
      .reduce((s,m)=> s+m.cost, 0);
    const groceriesSum = groceries
      .filter(g=> {
        // Use local month key for stored ISO dates
        const storedMonthKey = getLocalMonthKey(g.date.slice(0,10));
        return storedMonthKey === nowKey;
      })
      .reduce((s,g)=> s+g.amount, 0);
    return mealsSum + groceriesSum;
  }, [meals, groceries]);
  function totalSpendMonth(){
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return meals
      .filter(m => !isSeedMeal(m))
      .filter(m => {
        const storedMonthKey = getLocalMonthKey(m.date.slice(0,10));
        return storedMonthKey === ym;
      }).reduce((s,m)=> s+m.cost, 0);
  }
  function totalGroceryMonth(){
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return groceries.filter(g => {
      const storedMonthKey = getLocalMonthKey(g.date.slice(0,10));
      return storedMonthKey === ym;
    }).reduce((s,g)=> s+g.amount, 0);
  }
  function budgetBarColor(pct: number){
    if (pct <= 50) return 'bg-emerald-500';
    if (pct <= 80) return 'bg-yellow-500';
    if (pct <= 100) return 'bg-orange-500';
    return 'bg-red-500';
  }
  const chartData = useMemo(()=>{
    const days: {day:string; spend:number}[] = [];
    for (let i=13;i>=0;i--){ 
      const d=new Date(Date.now()-i*86400000); 
      const k=d.toISOString().slice(0,10);
      // For chart matching, compare using local date strings since stored dates should match local input dates
      const mealSpend = meals.filter(m=> !isSeedMeal(m) && m.date.slice(0,10)===k).reduce((s,m)=> s+m.cost, 0);
      const grocerySpend = groceries.filter(g=> g.date.slice(0,10)===k).reduce((s,g)=> s+g.amount, 0);
      const spend = mealSpend + grocerySpend;
      days.push({ day:k.slice(5), spend: Math.round(spend*100)/100 });
    }
    return days;
  }, [meals, groceries]);

  async function seedDemo(){
    try { for (const meal of seedMeals) { await FoodChooserAPI.addMeal(householdId!, meal); } await loadData(); }
    catch (err) { setError('Failed to load demo data'); }
  }

  async function addMeal(mealData: Omit<MealInsert, 'user_id' | 'created_at' | 'updated_at'>){
    try { const newMeal = await FoodChooserAPI.addMeal(householdId!, mealData); setMeals(prev => [newMeal, ...prev].sort((a,b)=> +new Date(b.date) - +new Date(a.date))); }
    catch (err) { setError('Failed to add meal'); }
  }

  // Helpers to log meals quickly from UI
  async function logFromMeal(m: Meal){
    await addMeal({
      date: new Date().toISOString(),
      restaurant: m.restaurant,
      dish: m.dish,
      cuisine: m.cuisine,
      cost: m.cost,
      rating: m.rating ?? null,
      notes: m.notes ?? null,
      seed_only: false,
      purchaser_name: 'Unknown'
    });
    showToast(t('Logged to Meal History'));
  }
  async function logFromRec(r: Recommendation){
    await addMeal({
      date: new Date().toISOString(),
      restaurant: r.suggestedRestaurant ? titleCase(r.suggestedRestaurant) : null,
      dish: r.dish ? titleCase(r.dish) : titleCase(r.label),
      cuisine: titleCase(r.label),
      cost: r.estCost,
      rating: null,
      notes: null,
      seed_only: false,
      purchaser_name: 'Unknown'
    });
    showToast(t('Logged to Meal History'));
  }

  // Select from Top choices: behave like Browse.Select (no egg; add to history directly)
  async function selectFromTopChoice(m: Meal){
    await addMeal({
      date: new Date().toISOString(),
      restaurant: m.restaurant,
      dish: m.dish,
      cuisine: m.cuisine,
      cost: m.cost,
      rating: m.rating ?? null,
      notes: m.notes ?? null,
      seed_only: false,
      purchaser_name: 'Unknown'
    });
    showToast(t('Selected! Added to your Meal History.'));
  }
  async function selectBrowseEntry(key: string){
    await addBrowseEntryToHistory(key);
    showToast(t('Selected! Added to your Meal History.'));
  }

  // Weighted random selection among top options
  function pickWeightedIndex(scores: number[]): number {
    if (!scores.length) return 0;
    const max = Math.max(...scores);
    const weights = scores.map(s => Math.exp((s - max)/8));
    const sum = weights.reduce((a,b)=> a+b, 0);
    let t = Math.random()*sum;
    for (let i=0;i<weights.length;i++){ t -= weights[i]; if (t<=0) return i; }
    return scores.length - 1;
  }

  // Ranked meals with cool-off and no-repeat enforcement
  const rankedMeals = useMemo(() => {
    const lastByCuisine = new Map<string, number>();
    for (const m of meals) {
      const t = new Date(m.date).getTime();
      const prev = lastByCuisine.get(m.cuisine) ?? 0;
      if (t > prev) lastByCuisine.set(m.cuisine, t);
    }
    const normalize = (s: string | null | undefined) => (s ?? '—').trim().toLowerCase();
    const now = Date.now();
    const scored = meals
      .filter(m => m.cost >= budgetSaved.min && m.cost <= budgetSaved.max)
      .filter(m => {
        if (forbidRepeatDaysSaved === 0) return true;
        const lastT = lastByCuisine.get(m.cuisine);
        if (!lastT) return true;
        const days = Math.floor((now - lastT) / 86400000);
        return days > forbidRepeatDaysSaved;
      })
      .filter(m => !coolOff[`${normalize(m.restaurant)}|${normalize(m.dish)}`])
      .map(m => { const b = computeMealScoreBreakdown(m, budgetSaved, wx); return { meal: m, score: b.total, breakdown: b }; });
    const bestByKey = new Map<string, { meal: Meal; score: number; breakdown: ReturnType<typeof computeMealScoreBreakdown> }>();
    for (const s of scored) {
      const key = `${normalize(s.meal.restaurant)}|${normalize(s.meal.dish)}`;
      const prev = bestByKey.get(key);
      if (!prev || s.score > prev.score) bestByKey.set(key, s);
    }
    const deduped = Array.from(bestByKey.values());
    deduped.sort((a,b) => (b.score !== a.score) ? (b.score - a.score) : (b.meal.cost - a.meal.cost));
    return deduped;
  }, [meals, budgetSaved, wx, forbidRepeatDaysSaved, coolOff]);

  // App pick index consistent across UI and egg
  const [appPickIdx, setAppPickIdx] = useState<number | null>(null);
  function computeAppPick() {
    const top = rankedMeals.slice(0, 5);
    if (!top.length) { setAppPickIdx(null); return; }
    const idx = pickWeightedIndex(top.map(t => t.score));
    setAppPickIdx(idx);
  }
  // Recompute app pick when opening choices, or when inputs change
  useEffect(() => { setAppPickIdx(null); }, [meals, budgetSaved, forbidRepeatDaysSaved, coolOff]);

  const featuredPick = useMemo(() => {
    if (!rankedMeals.length) return null;
    if (appPickIdx !== null && appPickIdx < rankedMeals.length) {
      return rankedMeals[appPickIdx];
    }
    return rankedMeals[0];
  }, [rankedMeals, appPickIdx]);
  const featuredIsMystery = useMemo(() => {
    if (appPickIdx === null || !featuredPick) return false;
    const match = rankedMeals[appPickIdx];
    return !!match && match.meal.id === featuredPick.meal.id;
  }, [rankedMeals, featuredPick, appPickIdx]);
  function crackEgg(){
    setIsOverride(false);
    const top = rankedMeals.slice(0,5);
    if (!top.length){ setPicked(undefined); setEggOpen(true); return; }
    const idx = appPickIdx ?? pickWeightedIndex(top.map(t => t.score));
    const chosen = top[idx].meal;
    setPicked({ key: chosen.id, label: displayTitle(chosen.cuisine, '—'), suggestedRestaurant: displayTitle(chosen.restaurant, undefined as any), dish: displayTitle(chosen.dish), estCost: chosen.cost, score: 0, tier: deriveTier(chosen.cost) });
    setEggOpen(true);
  }

  const [date, setDate] = useState(todayISO());
  const [restaurant, setRestaurant] = useState('');
  const [dish, setDish] = useState('');
  const [cuisineInput, setCuisineInput] = useState('Mexican');
  // Suggestions lists (case-insensitive unique)
  const restaurantOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of meals) { const v = (m.restaurant ?? '').trim(); if (v) set.add(v.toLowerCase()); }
    return Array.from(set).sort();
  }, [meals]);
  const dishOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of meals) { const v = (m.dish ?? '').trim(); if (v) set.add(v.toLowerCase()); }
    return Array.from(set).sort();
  }, [meals]);
  // Form fields
  const [cost, setCost] = useState<string>('15');
  const [rating, setRating] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [seedFlag, setSeedFlag] = useState<boolean>(false);
  const [mealPurchaserName, setMealPurchaserName] = useState<string>(displayName || '');
  const [groceryPurchaserName, setGroceryPurchaserName] = useState<string>(displayName || '');
  const [logTab, setLogTab] = useState<'meal'|'grocery'|'travel'>('meal');
  const [travelTag, setTravelTag] = useState<string>('');
  const [travelAmount, setTravelAmount] = useState<string>('100');
  const [travelDate, setTravelDate] = useState<string>(todayISO());
  const [travelNotes, setTravelNotes] = useState<string>('');
  const [travelPurchaserName, setTravelPurchaserName] = useState<string>(displayName || '');
  const [travelSaving, setTravelSaving] = useState<boolean>(false);

  // Update purchaser names when displayName changes
  useEffect(() => {
    if (displayName && !mealPurchaserName) {
      setMealPurchaserName(displayName);
    }
    if (displayName && !groceryPurchaserName) {
      setGroceryPurchaserName(displayName);
    }
    if (displayName && !travelPurchaserName) {
      setTravelPurchaserName(displayName);
    }
  }, [displayName]);
  // Contributions tab state
  const [contributionsDateRange, setContributionsDateRange] = useState<'mtd' | 'all' | 'custom'>('mtd');
  const [contributionsView, setContributionsView] = useState<'overview' | 'travelTags'>('overview');
  const [customDays, setCustomDays] = useState<string>('30');

  function titleCase(s: string) {
    return s
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map(w => w ? w[0].toUpperCase() + w.slice(1) : w)
      .join(' ');
  }
  function displayTitle(s: string | null | undefined, emptyFallback = 'Unknown') {
    const t = (s ?? '').trim();
    return t ? titleCase(t) : emptyFallback;
  }

  async function submitMeal(){
    const normalizedRestaurant = restaurant ? titleCase(restaurant) : null;
    const normalizedDish = dish ? titleCase(dish) : "Chef's choice";
    const normalizedCuisine = titleCase(cuisineInput);
    const seeded = seedFlag;
    const mealData = { 
      date: (date ? toLocalISOString(date) : new Date().toISOString()), 
      restaurant: normalizedRestaurant, 
      dish: normalizedDish, 
      cuisine: normalizedCuisine, 
      cost: Math.max(0, Number(cost) || 0), 
      rating, 
      notes: (seeded ? `${SEED_TAG} ` : '') + (notes || '') || null,
      seed_only: seeded,
      purchaser_name: mealPurchaserName.trim() || 'Unknown'
    };
    await addMeal(mealData);
    setDate(todayISO()); setRestaurant(''); setDish(''); setCuisineInput('Mexican'); setCost('15'); setRating(4); setNotes(''); setSeedFlag(false); setMealPurchaserName(displayName || '');
  }

  async function handleOrder(rec: Recommendation) {
    try {
      setError(null);
      const mealData = { date: new Date().toISOString(), restaurant: rec.suggestedRestaurant || null, dish: rec.dish ?? rec.label, cuisine: rec.label, cost: rec.estCost, rating: null, notes: null, seed_only: false, purchaser_name: 'Unknown' };
      await addMeal(mealData);
      if (isOverride) { const newCount = (overrides[rec.label] ?? 0) + 1; await FoodChooserAPI.upsertCuisineOverride(householdId!, rec.label, newCount); }
    setIsOverride(false);
    } catch (err) { console.error('Error handling order:', err); setError('Failed to save meal'); }
  }

  function openScoreHelp() {
    if (!rankedMeals.length) return;
    const top = rankedMeals[0];
    const b = top.breakdown;
    const lines = [
      `${t('Rating weight')}: ${b.ratingWeight.toFixed(1)}`,
      `${t('Recency penalty')}: ${b.recencyPenalty.toFixed(1)}`,
      `${t('Budget fit')}: ${b.budgetFit.toFixed(1)}`,
      `${t('Weather bonus')}: ${b.weatherBonus.toFixed(1)}`,
      `${t('Jitter')}: ${b.jitter.toFixed(1)}`,
      `${t('Total score')}: ${b.total.toFixed(1)}`
    ];
    setScoreHelpText(lines.join('\n'));
    setScoreHelpOpen(true);
  }

  // Browse: add latest entry to dinner history
  async function addBrowseEntryToHistory(key: string) {
    const entry = browseEntries.find(e => e.key === key);
    if (!entry) return;
    const latest = entry.latest;
    await addMeal({ date: new Date().toISOString(), restaurant: latest.restaurant, dish: latest.dish, cuisine: latest.cuisine, cost: latest.cost, rating: latest.rating ?? null, notes: latest.notes ?? null, seed_only: false, purchaser_name: 'Unknown' });
  }

  // Browse: delete entire group with confirmation (removes all history for that item)
  async function deleteBrowseGroup(key: string) {
    const entry = browseEntries.find(e => e.key === key);
    if (!entry) return;
    const ok = await requestConfirm({
      title: t('Delete saved meal?'),
      message: t('This removes every history entry for this dish.'),
      confirmLabel: t('Delete'),
      cancelLabel: t('Cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    const [restaurantName, dishName] = key.split('|');
    const toDelete = meals.filter(m => (m.restaurant ?? '—') === restaurantName && m.dish === dishName);
    for (const m of toDelete) {
      try { await FoodChooserAPI.deleteMeal(householdId!, m.id); } catch (e) { console.error('Failed delete', e); setError('Failed to delete one or more entries'); }
    }
    setMeals(prev => prev.filter(m => !toDelete.some(d => d.id === m.id)));
  }

  // History edit helpers
  function startEdit(m: Meal) { setEditMeal(m); setEditOriginal(m); }
  async function saveEdit() {
    if (!editMeal || !editOriginal) return;
    try {
      setEditSaving(true);
      const restaurantChanged = (editMeal.restaurant ?? null) !== (editOriginal.restaurant ?? null);
      const dishChanged = editMeal.dish !== editOriginal.dish;
      if (restaurantChanged || dishChanged) {
        // Create a new entry, preserve original untouched
        const newData = {
          date: editMeal.date,
          restaurant: editMeal.restaurant ?? null,
          dish: editMeal.dish,
          cuisine: editMeal.cuisine,
          cost: editMeal.cost,
          rating: editMeal.rating ?? null,
          notes: editMeal.notes ?? null,
          seed_only: (editMeal as any).seed_only === true,
          purchaser_name: editMeal.purchaser_name || 'Unknown'
        };
        const created = await FoodChooserAPI.addMeal(householdId!, newData);
        setMeals(prev => [created, ...prev].sort((a,b)=> +new Date(b.date) - +new Date(a.date)));
        setEditMeal(null);
        setEditOriginal(null);
      } else {
        // Update in place
        const updated = await FoodChooserAPI.updateMeal(householdId!, editMeal.id, {
          date: editMeal.date,
          restaurant: editMeal.restaurant,
          dish: editMeal.dish,
          cuisine: editMeal.cuisine,
          cost: editMeal.cost,
          rating: editMeal.rating ?? null,
          notes: editMeal.notes ?? null,
          purchaser_name: editMeal.purchaser_name || 'Unknown'
        });
        setMeals(prev => prev.map(m => m.id === updated.id ? updated : m).sort((a,b)=> +new Date(b.date) - +new Date(a.date)));
        setEditMeal(null);
        setEditOriginal(null);
      }
    } catch (e) {
      console.error('Save edit failed', e);
      setError('Failed to save edit');
    } finally { setEditSaving(false); }
  }

  async function deleteHistory(id: string) {
    try {
      const ok = await requestConfirm({
        title: t('Delete meal entry?'),
        message: t('This removes it from your meal history.'),
        confirmLabel: t('Delete'),
        cancelLabel: t('Cancel'),
        tone: 'danger',
      });
      if (!ok) return;
      await FoodChooserAPI.deleteMeal(householdId!, id);
      setMeals(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Delete failed', e);
      setError('Failed to delete entry');
    }
  }

  function startEditGrocery(entry: Grocery) {
    setEditGrocery(entry);
    setGDate(entry.date.slice(0, 10));
    setGAmount(entry.amount?.toString() ?? '0');
    setGroceryPurchaserName(entry.purchaser_name ?? '');
    setGStore(entry.notes ?? '');
    setShowStoreDropdown(false);
    setSelectedStoreIndex(-1);
  }

  async function saveGroceryEdit() {
    if (!editGrocery) return;
    try {
      const amt = Number(gAmount) || 0;
      if (amt <= 0) { showToast(t('Enter a valid amount')); return; }
      const updated = await FoodChooserAPI.updateGrocery(householdId!, editGrocery.id, {
        date: toLocalISOString(gDate),
        amount: amt,
        notes: gStore || null,
        purchaser_name: groceryPurchaserName.trim() || 'Unknown',
      });
      setGroceries(prev => prev
        .map(g => g.id === updated.id ? updated : g)
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      );
      setEditGrocery(null);
      setGDate(todayISO()); setGAmount('50'); setGStore(''); setGroceryPurchaserName(displayName || '');
      setShowStoreDropdown(false);
      setSelectedStoreIndex(-1);
      showToast(t('Grocery trip updated'));
    } catch (e) {
      console.error('Save grocery edit failed', e);
      setError('Failed to save grocery edit');
    }
  }

  async function deleteGroceryHistory(id: string) {
    try {
      const ok = await requestConfirm({
        title: t('Delete grocery entry?'),
        message: t('This removes it from your grocery history.'),
        confirmLabel: t('Delete'),
        cancelLabel: t('Cancel'),
        tone: 'danger',
      });
      if (!ok) return;
      await FoodChooserAPI.deleteGrocery(householdId!, id);
      setGroceries(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      console.error('Delete grocery failed', e);
      setError('Failed to delete grocery entry');
    }
  }

  async function deleteTravelEntry(id: string) {
    try {
      const ok = await requestConfirm({
        title: t('Remove travel log?'),
        message: t('This deletes the tagged travel spend record.'),
        confirmLabel: t('Delete'),
        cancelLabel: t('Cancel'),
        tone: 'danger',
      });
      if (!ok) return;
      await FoodChooserAPI.deleteGrocery(householdId!, id);
      setGroceries(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      console.error('Delete travel entry failed', e);
      setError('Failed to delete travel entry');
    }
  }

  // Extract unique stores from grocery history for autocomplete
  const uniqueStores = useMemo(() => {
    const stores = groceries
      .map(g => g.notes?.trim())
      .filter((store): store is string => Boolean(store))
      .reduce((unique, store) => {
        const normalized = store.toLowerCase();
        if (!unique.some(s => s.toLowerCase() === normalized)) {
          unique.push(store);
        }
        return unique;
      }, [] as string[]);
    return stores.sort();
  }, [groceries]);

  // Filter stores for autocomplete based on current input
  const filteredStores = useMemo(() => {
    if (!gStore.trim()) return [];
    const query = gStore.toLowerCase().trim();
    return uniqueStores.filter(store => 
      store.toLowerCase().includes(query)
    ).slice(0, 5); // Limit to 5 suggestions
  }, [gStore, uniqueStores]);

  const travelEntries = useMemo(() => {
    return groceries.filter(g => (g.trip_label ?? '').trim().length > 0)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [groceries]);

  const groceryEntries = useMemo(() => {
    return groceries.filter(g => !(g.trip_label ?? '').trim())
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [groceries]);

  // For Browse: compute deduped entries by (restaurant, dish) with latest date and latest price (case-insensitive)
  const browseEntries = useMemo(() => {
    const byKey = new Map<string, Meal[]>();
    const normalize = (s: string | null | undefined) => (s ?? '—').trim().toLowerCase();
    for (const m of meals) {
      const key = `${normalize(m.restaurant)}|${normalize(m.dish)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(m);
    }
    const items = Array.from(byKey.entries()).map(([key, list]) => {
      const sorted = [...list].sort((a,b)=> +new Date(b.date) - +new Date(a.date));
      const latest = sorted[0];
      return { key, latest, history: sorted.slice().reverse() };
    });
    return items.filter(it => {
      const q = browseSearch.toLowerCase();
      if (!q) return true;
      return (
        it.latest.dish.toLowerCase().includes(q) ||
        (it.latest.restaurant ?? '').toLowerCase().includes(q) ||
        it.latest.cuisine.toLowerCase().includes(q)
      );
    });
  }, [meals, browseSearch]);

  const cuisineOptions = useMemo(() => {
    const set = new Set<string>();
    meals.forEach(m => {
      const c = (m.cuisine || '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meals]);

  const filteredCuisineOptions = useMemo(() => {
    const query = cuisineQuery.trim().toLowerCase();
    if (!query) return cuisineOptions;
    return cuisineOptions.filter(c => c.toLowerCase().includes(query));
  }, [cuisineOptions, cuisineQuery]);

  const cuisineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of browseEntries) {
      const key = normalizeCuisine(entry.latest.cuisine ?? '');
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [browseEntries]);

  const visibleBrowseEntries = useMemo(() => {
    const includeAll = Object.keys(cuisineFilter).length === 0;

    let items = browseEntries.filter(entry => {
      if (includeAll) return true;
      const key = normalizeCuisine(entry.latest.cuisine ?? '');
      return cuisineFilter[key] !== false;
    });

    if (browseHideDisabled) {
      items = items.filter(entry => !coolOff[entry.key]);
    }

    const sorted = [...items];
    sorted.sort((a, b) => {
      if (browseSort === 'rating') {
        const ar = a.latest.rating ?? 0;
        const br = b.latest.rating ?? 0;
        if (br !== ar) return br - ar;
      } else if (browseSort === 'cost') {
        const ac = a.latest.cost ?? 0;
        const bc = b.latest.cost ?? 0;
        if (ac !== bc) return ac - bc;
      } else {
        const ad = +new Date(a.latest.date);
        const bd = +new Date(b.latest.date);
        if (bd !== ad) return bd - ad;
      }
      return (a.latest.dish || '').localeCompare(b.latest.dish || '');
    });

    return sorted;
  }, [browseEntries, cuisineFilter, browseHideDisabled, browseSort, coolOff]);

  const allCuisineMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    cuisineOptions.forEach(c => {
      map[normalizeCuisine(c)] = true;
    });
    return map;
  }, [cuisineOptions]);

  const handleCuisineSelectAll = () => setCuisineFilter(allCuisineMap);
  const handleCuisineClear = () => {
    if (!cuisineOptions.length) {
      setCuisineFilter({});
      return;
    }
    const cleared: Record<string, boolean> = {};
    cuisineOptions.forEach(c => {
      cleared[normalizeCuisine(c)] = false;
    });
    setCuisineFilter(cleared);
  };

  async function toggleDisabledKey(normKey: string) {
    const [r, d] = normKey.split('|');
    const next = !coolOff[normKey];
    // optimistic update
    setCoolOff(prev => ({ ...prev, [normKey]: next }));
    setCoolSavingKey(normKey);
    try {
      await FoodChooserAPI.setDisabledItem(householdId!, r, d, next);
      // re-fetch from Supabase to ensure persistence
      const latest = await FoodChooserAPI.getDisabledItems(householdId!);
      setCoolOff(latest);
    } catch (e) {
      // rollback on failure
      setCoolOff(prev => ({ ...prev, [normKey]: !next }));
    } finally {
      setCoolSavingKey(null);
    }
  }

  async function setDisabledForCuisine(selectedCuisineKeys: string[], disabled: boolean) {
    // Collect all normalized item keys under selected cuisines
    const selectedSet = new Set(selectedCuisineKeys.map(k => normalizeCuisine(k)));
    const itemKeys = browseEntries
      .filter(e => selectedSet.has(normalizeCuisine(e.latest.cuisine ?? '')))
      .map(e => e.key);
    if (!itemKeys.length) return;
    setCuisineBatchSaving(true);
    try {
      // optimistic bulk update
      setCoolOff(prev => {
        const nextMap = { ...prev };
        for (const key of itemKeys) nextMap[key] = disabled;
        return nextMap;
      });
      for (const key of itemKeys) {
        const [r, d] = key.split('|');
        await FoodChooserAPI.setDisabledItem(householdId!, r, d, disabled);
      }
      const latest = await FoodChooserAPI.getDisabledItems(householdId!);
      setCoolOff(latest);
    } finally {
      setCuisineBatchSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-emerald-100 px-4 py-10 text-zinc-900 transition-colors duration-300 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-center py-20">
          <div className="w-full space-y-4 rounded-3xl border border-white/60 bg-white/70 p-10 text-center shadow-2xl backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/80">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-rose-400 to-purple-500 text-2xl text-white shadow-lg">
              🍜
            </div>
            <div className="text-lg font-semibold">{t('Loading your food data...')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-emerald-100 px-4 py-10 text-zinc-900 transition-colors duration-300 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-center py-20">
          <div className="w-full space-y-5 rounded-3xl border border-white/60 bg-white/80 p-10 text-center shadow-2xl backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/80">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-red-500 to-orange-400 text-2xl text-white shadow-lg">
              ⚠️
            </div>
            <div className="text-lg font-semibold text-rose-600 dark:text-rose-300">{t('Error')}: {error}</div>
            <button className="btn-primary" onClick={() => { setError(null); loadData(); }}>{t('Retry')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-emerald-100 px-3 sm:px-4 pb-16 pt-4 sm:pt-6 text-zinc-900 transition-colors duration-300 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950 dark:text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6 sm:space-y-10">
        <header className="overflow-hidden rounded-2xl sm:rounded-[2.25rem] border border-white/60 bg-white/70 px-4 sm:px-6 py-5 sm:py-7 shadow-xl sm:shadow-2xl shadow-amber-200/30 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/70 dark:shadow-emerald-500/10 md:px-10 md:py-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative">
                  <div className="h-16 w-16 overflow-hidden rounded-3xl border border-white/70 shadow-xl shadow-rose-200/50 dark:border-white/10">
                    <img
                      src={crackedEggImg}
                      alt={t('FuDi holding a mystery egg')}
                      className="h-full w-full object-cover object-[55%_32%]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <Sparkles className="h-4 w-4" /> {t('Track & Decide')}
                  </div>
                  <h1 className="text-3xl font-semibold leading-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
                    {t('Budget tracker that chooses for you')}
                  </h1>
                  <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-300">
                    {t("Crack an egg to pick a meal, track spending on meals, groceries & travel, and share budgets with your household.")}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:gap-3 grid-cols-3">
                {quickStats.map((stat) => (
                  <div key={stat.label} className="rounded-lg sm:rounded-2xl border border-white/60 bg-white/80 p-2 sm:p-4 shadow-inner shadow-amber-100/40 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/70">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{stat.label}</div>
                    <div className="mt-1 sm:mt-2 text-sm sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 self-stretch">
              <div className="flex flex-wrap justify-end gap-3">
                {/* User Profile */}
                <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/60 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-zinc-800/60">
                  <div className="text-right">
                    <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{user?.email}</p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{householdName}</p>
                  </div>
                  <button
                    onClick={signOut}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-rose-100 text-rose-600 transition hover:bg-rose-200 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                    title={t('Sign out')}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-xs font-medium backdrop-blur dark:border-white/10 dark:bg-zinc-800/60"
                  onClick={toggleTheme}
                  aria-label={isDarkTheme ? t('Switch to light theme') : t('Switch to dark theme')}
                  title={isDarkTheme ? t('Switch to light theme') : t('Switch to dark theme')}
                >
                  {isDarkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span>{isDarkTheme ? t('Light') : t('Dark')}</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-xs font-medium backdrop-blur dark:border-white/10 dark:bg-zinc-800/60"
                  onClick={() => setLanguage(prev => (prev === 'en' ? 'zh' : 'en'))}
                  aria-label={t('Switch Language')}
                  title={t('Switch Language')}
                >
                  <Languages className="h-4 w-4" />
                  <span>{language === 'en' ? '中文' : 'EN'}</span>
                </button>
              </div>
              <nav className="rounded-2xl sm:rounded-3xl border border-white/60 bg-white/80 p-1.5 sm:p-2 shadow-inner shadow-amber-100/40 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/70">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  {navButtons.map((nav) => {
                    const Icon = nav.icon;
                    const active = activeTab === nav.key;
                    return (
                      <button
                        key={nav.key}
                        type="button"
                        onClick={() => setActiveTab(nav.key)}
                        className={`flex flex-1 items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 dark:focus-visible:ring-emerald-300 min-h-[56px] ${
                          active
                            ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-400/40'
                            : 'hover:bg-white/70 active:bg-white dark:hover:bg-zinc-800/70 dark:active:bg-zinc-800'
                        }`}
                      >
                        <span className={`inline-flex h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border ${active ? 'border-white/30 bg-white/20 text-white' : 'border-emerald-200 bg-emerald-100 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                          <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${active ? 'text-white' : 'text-inherit'}`} />
                        </span>
                        <span className="flex flex-col flex-1 min-w-0">
                          <span className="font-semibold text-sm sm:text-base truncate">{nav.label}</span>
                          <span className={`text-[11px] sm:text-xs truncate ${active ? 'text-emerald-100' : 'text-zinc-500 dark:text-zinc-400'}`}>{nav.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </nav>
            </div>
          </div>
        </header>

        <div className="space-y-8">
          {activeTab==='contributions' ? (
        <div className="space-y-6">
          {/* Contributions Tab Content */}
          <div className={panelClass}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold">💰 {t('Spending Contributions')}</div>
                <div className="text-xs text-zinc-600 mt-1 dark:text-zinc-400">{t("See who's been buying meals, groceries, and travel")}</div>
              </div>
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                <button
                  className={rangeButtonClass(contributionsDateRange === 'mtd')}
                  onClick={() => setContributionsDateRange('mtd')}
                >
                  {t('Month to Date')}
                </button>
                <button
                  className={rangeButtonClass(contributionsDateRange === 'all')}
                  onClick={() => setContributionsDateRange('all')}
                >
                  {t('All Time')}
                </button>
                <button
                  className={rangeButtonClass(contributionsDateRange === 'custom')}
                  onClick={() => setContributionsDateRange('custom')}
                >
                  {t('Custom')}
                </button>
                {contributionsDateRange === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input 
                      className="input text-xs w-16" 
                      type="number" 
                      min="1" 
                      max="999"
                      value={customDays} 
                      onChange={e => setCustomDays(e.target.value)}
                      placeholder="30"
                    />
                    <span className="text-xs text-zinc-600">days</span>
                  </div>
                )}
              </div>
                <div className="flex items-center gap-2">
                  <button
                    className={rangeButtonClass(contributionsView === 'overview')}
                    onClick={() => setContributionsView('overview')}
                  >
                    {t('Overview')}
                  </button>
                  <button
                    className={rangeButtonClass(contributionsView === 'travelTags')}
                    onClick={() => setContributionsView('travelTags')}
                  >
                    {t('Travel Tags')}
                  </button>
                </div>
              </div>
            </div>

            {(() => {
              // Calculate cutoff date based on selected range
              let cutoffDate: Date;
              let dateLabel: string;
              
              if (contributionsDateRange === 'mtd') {
                const now = new Date();
                cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
                const labelDate = cutoffDate.toLocaleDateString(language === 'zh' ? 'zh-TW' : undefined);
                dateLabel = language === 'zh' ? `本月至今 (${labelDate})` : `Month to Date (${labelDate})`;
              } else if (contributionsDateRange === 'all') {
                cutoffDate = new Date(2020, 0, 1);
                dateLabel = language === 'zh' ? '所有時間' : 'All Time';
              } else {
                const days = Math.max(1, parseInt(customDays) || 30);
                cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                dateLabel = language === 'zh'
                  ? `過去 ${days} 天`
                  : `Past ${days} day${days === 1 ? '' : 's'}`;
              }

              const recentMeals = meals.filter(m => new Date(m.date) >= cutoffDate && !isSeedMeal(m));
              const recentGroceriesAll = groceries.filter(g => new Date(g.date) >= cutoffDate);
              const recentTravel = recentGroceriesAll.filter(g => (g.trip_label ?? '').trim().length > 0);
              const recentGroceries = recentGroceriesAll.filter(g => !(g.trip_label ?? '').trim());

              // Calculate spending by person
              const spendingByPerson: Record<string, { meals: number; groceries: number; travel: number; total: number }> = {};

              const ensurePersonBucket = (person: string) => {
                if (!spendingByPerson[person]) {
                  spendingByPerson[person] = { meals: 0, groceries: 0, travel: 0, total: 0 };
                }
                return spendingByPerson[person];
              };

              recentMeals.forEach(m => {
                const person = m.purchaser_name || 'Unknown';
                const bucket = ensurePersonBucket(person);
                bucket.meals += m.cost;
                bucket.total += m.cost;
              });

              recentGroceries.forEach(g => {
                const person = g.purchaser_name || 'Unknown';
                const bucket = ensurePersonBucket(person);
                bucket.groceries += g.amount;
                bucket.total += g.amount;
              });

              recentTravel.forEach(g => {
                const person = g.purchaser_name || 'Unknown';
                const bucket = ensurePersonBucket(person);
                bucket.travel += g.amount;
                bucket.total += g.amount;
              });

              const people = Object.keys(spendingByPerson);
              const totalSpending = Object.values(spendingByPerson).reduce((sum, p) => sum + p.total, 0);

              const getPersonColor = (person: string) => {
                switch (person) {
                  case 'Ryan':
                    return { bg: 'bg-blue-500', light: 'bg-blue-100', darkBg: 'dark:bg-blue-500/20', text: 'text-blue-800', darkText: 'dark:text-blue-100' };
                  case 'Rachel':
                    return { bg: 'bg-purple-500', light: 'bg-purple-100', darkBg: 'dark:bg-purple-500/20', text: 'text-purple-800', darkText: 'dark:text-purple-100' };
                  default:
                    return { bg: 'bg-gray-500', light: 'bg-gray-100', darkBg: 'dark:bg-zinc-500/20', text: 'text-gray-600', darkText: 'dark:text-zinc-100' };
                }
              };

              if (contributionsView === 'travelTags') {
                if (!recentTravel.length) {
                  return (
                    <div className="py-8 text-center text-zinc-600 dark:text-zinc-300">
                      <div className="mb-2 text-lg">{t('No travel spend in this range.')}</div>
                      <div className="text-sm">{t('Log travel-tagged grocery entries to see insights here.')}</div>
                    </div>
                  );
                }

                const travelTagMap = new Map<string, { total: number; count: number; lastDate: Date; perPerson: Record<string, number> }>();
                recentTravel.forEach(entry => {
                  const label = (entry.trip_label ?? '').trim() || '—';
                  if (!travelTagMap.has(label)) {
                    travelTagMap.set(label, { total: 0, count: 0, lastDate: new Date(entry.date), perPerson: {} });
                  }
                  const bucket = travelTagMap.get(label)!;
                  bucket.total += entry.amount;
                  bucket.count += 1;
                  const entryDate = new Date(entry.date);
                  if (entryDate.getTime() > bucket.lastDate.getTime()) {
                    bucket.lastDate = entryDate;
                  }
                  const person = entry.purchaser_name || 'Unknown';
                  bucket.perPerson[person] = (bucket.perPerson[person] ?? 0) + entry.amount;
                });

                const tagRows = Array.from(travelTagMap.entries()).map(([tag, info]) => ({
                  tag,
                  total: Number(info.total.toFixed(2)),
                  count: info.count,
                  lastDate: info.lastDate,
                  people: Object.entries(info.perPerson)
                    .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }))
                    .sort((a, b) => b.amount - a.amount),
                })).sort((a, b) => b.total - a.total);

                const totalTravelAmount = tagRows.reduce((sum, row) => sum + row.total, 0);
                const uniqueTags = tagRows.length;
                const topTag = tagRows[0];

                return (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-sky-200/70 bg-sky-50/60 p-4 dark:border-sky-500/40 dark:bg-sky-500/10">
                        <div className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">{t('Total Travel Spend')}</div>
                        <div className="mt-2 text-2xl font-bold text-sky-700 dark:text-sky-200">{currency(totalTravelAmount)}</div>
                        <div className="text-xs text-sky-600/80 dark:text-sky-300/80">{tt('{count} transactions', { count: recentTravel.length })}</div>
                      </div>
                      <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">{t('Travel Transactions')}</div>
                        <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-200">{recentTravel.length}</div>
                        <div className="text-xs text-emerald-600/80 dark:text-emerald-300/80">{t('Total entries')}</div>
                      </div>
                      <div className="rounded-2xl border border-purple-200/70 bg-purple-50/60 p-4 dark:border-purple-500/40 dark:bg-purple-500/10">
                        <div className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">{t('Unique Travel Tags')}</div>
                        <div className="mt-2 text-2xl font-bold text-purple-700 dark:text-purple-200">{uniqueTags}</div>
                        <div className="text-xs text-purple-600/80 dark:text-purple-300/80">{t('Tag')}</div>
                      </div>
                      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
                        <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">{t('Top Travel Tag')}</div>
                        <div className="mt-2 text-lg font-semibold text-amber-700 dark:text-amber-200">{topTag?.tag ?? '—'}</div>
                        <div className="text-xs text-amber-600/80 dark:text-amber-300/80">{topTag ? currency(topTag.total) : t('No spending data found')}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="mb-4">
                        <div className="text-sm font-semibold">{t('Travel tag contributions')}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">{t('Sorted by total spend within selected range')}</div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table">
                          <thead>
                            <tr className="bg-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                              <th className="th text-left">{t('Tag')}</th>
                              <th className="th text-center">{t('Travel Transactions')}</th>
                              <th className="th text-right">{t('Amount (USD)')}</th>
                              <th className="th text-left">{t('Per person')}</th>
                              <th className="th text-left">{t('Last logged')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tagRows.map(row => (
                              <tr key={`${row.tag}-${row.lastDate.getTime()}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                                <td className="td">{row.tag}</td>
                                <td className="td text-center">{row.count}</td>
                                <td className="td text-right">{currency(row.total)}</td>
                                <td className="td">
                                  <div className="flex flex-wrap gap-1">
                                    {row.people.map(({ name, amount }) => {
                                      const color = getPersonColor(name);
                                      return (
                                        <span
                                          key={`${row.tag}-${name}`}
                                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${color.light} ${color.darkBg} ${color.text} ${color.darkText}`}
                                        >
                                          {name}
                                          <span className="font-semibold">{currency(amount)}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>
                                <td className="td">{row.lastDate.toISOString().slice(0,10)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              }

              if (people.length === 0) {
                return (
                  <div className="text-center py-8 text-zinc-600">
                    <div className="text-lg mb-2">{t('No spending data found')}</div>
                    <div className="text-sm">{t('Try selecting a longer time period or add some meals/groceries with purchaser names')}</div>
                  </div>
                );
              }

              return (
                (() => {
                  const palette = ['#6366f1', '#a855f7', '#22c55e', '#f97316', '#0ea5e9', '#f59e0b'];
                  const mealCountByPerson: Record<string, number> = {};
                  const groceryCountByPerson: Record<string, number> = {};
                  const travelCountByPerson: Record<string, number> = {};
                  recentMeals.forEach(m => {
                    const person = m.purchaser_name || 'Unknown';
                    mealCountByPerson[person] = (mealCountByPerson[person] ?? 0) + 1;
                  });
                  recentGroceries.forEach(g => {
                    const person = g.purchaser_name || 'Unknown';
                    groceryCountByPerson[person] = (groceryCountByPerson[person] ?? 0) + 1;
                  });
                  recentTravel.forEach(g => {
                    const person = g.purchaser_name || 'Unknown';
                    travelCountByPerson[person] = (travelCountByPerson[person] ?? 0) + 1;
                  });
                  const stackedData = people.map((person, idx) => {
                    const mealsAmount = Number(spendingByPerson[person].meals.toFixed(2));
                    const groceriesAmount = Number(spendingByPerson[person].groceries.toFixed(2));
                    const travelAmount = Number(spendingByPerson[person].travel.toFixed(2));
                    const totalAmount = Number(spendingByPerson[person].total.toFixed(2));
                    return {
                      person,
                      Meals: mealsAmount,
                      Groceries: groceriesAmount,
                      Travel: travelAmount,
                      Total: totalAmount,
                      color: palette[idx % palette.length],
                      mealCount: mealCountByPerson[person] ?? 0,
                      groceryCount: groceryCountByPerson[person] ?? 0,
                      travelCount: travelCountByPerson[person] ?? 0,
                    };
                  });
                  const totalMealsAmount = stackedData.reduce((sum, d) => sum + d.Meals, 0);
                  const totalGroceriesAmount = stackedData.reduce((sum, d) => sum + d.Groceries, 0);
                  const totalTravelAmount = stackedData.reduce((sum, d) => sum + d.Travel, 0);
                  const pieData = stackedData.map((d, idx) => ({ name: d.person, value: d.Total, fill: palette[idx % palette.length] }));
                  const axisColor = theme === 'dark' ? '#e4e4e7' : '#3f3f46';
                  const gridColor = theme === 'dark' ? '#3f3f46' : '#e4e4e7';
                  const shareFormatter = (value: number) => totalSpending ? `${((value / totalSpending) * 100).toFixed(1)}%` : '0.0%';
                  const activity = [
                    ...recentMeals.map(m => ({
                      id: `m-${m.id}`,
                      type: 'Meal' as const,
                      label: m.dish || 'Meal',
                      place: m.restaurant || '—',
                      person: m.purchaser_name || 'Unknown',
                      amount: m.cost,
                      date: new Date(m.date),
                    })),
                    ...recentGroceries.map(g => ({
                      id: `g-${g.id}`,
                      type: 'Grocery' as const,
                      label: g.notes || 'Groceries',
                      place: g.notes || 'Groceries',
                      person: g.purchaser_name || 'Unknown',
                      amount: g.amount,
                      date: new Date(g.date),
                    })),
                    ...recentTravel.map(g => ({
                      id: `t-${g.id}`,
                      type: 'Travel' as const,
                      label: (g.trip_label ?? '').trim() || t('Travel'),
                      place: (g.notes ?? '').trim() || t('Travel Tag'),
                      person: g.purchaser_name || 'Unknown',
                      amount: g.amount,
                      date: new Date(g.date),
                    })),
                  ]
                    .sort((a, b) => b.date.getTime() - a.date.getTime())
                    .slice(0, 6);

                  return (
                    <div className="space-y-8">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                          📅 {dateLabel}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                          <span>{recentMeals.length} meal txns</span>
                          <span>•</span>
                          <span>{recentGroceries.length} grocery txns</span>
                          <span>•</span>
                          <span>{recentTravel.length} travel txns</span>
                          <span>•</span>
                          <span>Total {currency(totalSpending)}</span>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4 dark:border-orange-500/40 dark:bg-orange-500/10">
                          <div className="text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-300">{t('Meals')}</div>
                          <div className="mt-2 text-2xl font-bold text-orange-700 dark:text-orange-200">{currency(totalMealsAmount)}</div>
                          <div className="text-xs text-orange-600/80 dark:text-orange-300/80">{tt('{count} transactions', { count: recentMeals.length })}</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
                          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">{t('Groceries')}</div>
                          <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-200">{currency(totalGroceriesAmount)}</div>
                          <div className="text-xs text-emerald-600/80 dark:text-emerald-300/80">{tt('{count} transactions', { count: recentGroceries.length })}</div>
                        </div>
                        <div className="rounded-2xl border border-sky-200/70 bg-sky-50/60 p-4 dark:border-sky-500/40 dark:bg-sky-500/10">
                          <div className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">{t('Travel')}</div>
                          <div className="mt-2 text-2xl font-bold text-sky-700 dark:text-sky-200">{currency(totalTravelAmount)}</div>
                          <div className="text-xs text-sky-600/80 dark:text-sky-300/80">{tt('{count} transactions', { count: recentTravel.length })}</div>
                        </div>
                        <div className="rounded-2xl border border-blue-200/70 bg-blue-50/60 p-4 dark:border-blue-500/40 dark:bg-blue-500/10">
                          <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">{t('Total')}</div>
                          <div className="mt-2 text-2xl font-bold text-blue-700 dark:text-blue-200">{currency(totalSpending)}</div>
                          <div className="text-xs text-blue-600/80 dark:text-blue-300/80">{tt('{count} transactions', { count: recentMeals.length + recentGroceries.length + recentTravel.length })}</div>
                        </div>
                      </div>

                      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                          <div className="mb-4 flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">{t('Spend mix by person')}</div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">{t('Stacked by meals, groceries, and travel')}</div>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>{t('Groceries')}</span>
                              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-500"></span>{t('Meals')}</span>
                              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500"></span>{t('Travel')}</span>
                            </div>
                          </div>
                          <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={stackedData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.5} />
                                <XAxis dataKey="person" stroke={axisColor} tick={{ fill: axisColor }} />
                                <YAxis stroke={axisColor} tick={{ fill: axisColor }} tickFormatter={value => `$${value}`} />
                                <Tooltip
                                  formatter={(value: number | string) => (typeof value === 'number' ? currency(value) : value)}
                                  cursor={{ fill: theme === 'dark' ? '#27272a' : '#f4f4f5' }}
                                  contentStyle={{ backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', border: '1px solid', borderColor: theme === 'dark' ? '#3f3f46' : '#e5e7eb', color: axisColor }}
                                />
                                <Bar dataKey="Groceries" stackId="a" fill="#22c55e" radius={[0, 0, 6, 6]} />
                                <Bar dataKey="Meals" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="Travel" stackId="a" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                          <div className="mb-4 text-sm font-semibold">{t('Share of total spending')}</div>
                          <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Tooltip
                                  formatter={(value: number | string, _name, payload) => [typeof value === 'number' ? currency(value) : value, payload?.name]}
                                  contentStyle={{ backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', border: '1px solid', borderColor: theme === 'dark' ? '#3f3f46' : '#e5e7eb', color: axisColor }}
                                />
                                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                                  {pieData.map(slice => (
                                    <Cell key={slice.name} fill={slice.fill} />
                                  ))}
                                </Pie>
                                <Legend
                                  verticalAlign="bottom"
                                  height={24}
                                  formatter={(value: string) => {
                                    const total = stackedData.find(d => d.person === value)?.Total ?? 0;
                                    return `${value} • ${shareFormatter(total)}`;
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="mt-4 space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {stackedData.map(d => (
                              <div key={d.person} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                                <div className="flex items-center gap-2">
                                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{d.person}</span>
                                </div>
                                <div className="text-right">
                                  <div className="font-semibold text-zinc-700 dark:text-zinc-100">{currency(d.Total)} ({shareFormatter(d.Total)})</div>
                                  <div>{t('Meals')}: {d.mealCount} • {t('Groceries')}: {d.groceryCount} • {t('Travel')}: {d.travelCount}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className={`${glassCardClass} bg-gradient-to-br from-white/95 via-white/70 to-emerald-50/30 dark:from-zinc-900/80 dark:via-zinc-900/60 dark:to-emerald-900/20`}>
                        <div className="mb-4 flex items-center justify-between">
                          <div className="text-sm font-semibold">{t('Recent transactions')}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">{t('Most recent 6 entries in range')}</div>
                        </div>
                        <div className="grid gap-2 text-sm">
                          {activity.length ? (
                            activity.map(item => {
                              const typeLabel = item.type === 'Meal' ? t('Meal') : item.type === 'Grocery' ? t('Groceries') : t('Travel');
                              const detailLabel = item.type === 'Meal' ? item.place : item.type === 'Grocery' ? t('Grocery Trip') : item.place;
                              return (
                                <div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                                  <div>
                                    <div className="font-medium text-zinc-800 dark:text-zinc-100">{item.label}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{typeLabel} • {item.person} • {item.date.toISOString().slice(0,10)}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold text-zinc-800 dark:text-zinc-100">{currency(item.amount)}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{detailLabel}</div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                              {t('No activity found for this range.')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              );
            })()}
          </div>
        </div>
      ) : activeTab==='household' ? (
        <div className={panelClass}>
          <HouseholdSettings />
        </div>
      ) : activeTab==='browse' ? (
        <div className={`${panelClass} space-y-6`}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    className="input w-full pl-9"
                    placeholder={t('Search dish, restaurant, cuisine')}
                    value={browseSearch}
                    onChange={e => setBrowseSearch(e.target.value)}
                  />
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {tt('Showing {current} of {total} saved meals', { current: visibleBrowseEntries.length, total: browseEntries.length })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{t('View')}:</span>
                  <div className="inline-flex rounded-full border border-white/60 bg-white/70 p-1 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-800/60">
                    <button
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${browseHideDisabled ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow shadow-emerald-400/50' : 'text-zinc-600 hover:bg-white/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80'}`}
                      onClick={() => setBrowseHideDisabled(true)}
                      type="button"
                    >
                      {t('Enabled only')}
                    </button>
                    <button
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${!browseHideDisabled ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow shadow-emerald-400/50' : 'text-zinc-600 hover:bg-white/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80'}`}
                      onClick={() => setBrowseHideDisabled(false)}
                      type="button"
                    >
                      {t('Include disabled')}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{t('Sort')}:</span>
                  <div className="inline-flex rounded-full border border-white/60 bg-white/70 p-1 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-800/60">
                    {[
                      { key: 'recent', label: t('Newest') },
                      { key: 'rating', label: t('Rating') },
                      { key: 'cost', label: t('Cost (low)') }
                    ].map(option => (
                      <button
                        key={option.key}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${browseSort === option.key ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow shadow-emerald-400/50' : 'text-zinc-600 hover:bg-white/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80'}`}
                        onClick={() => setBrowseSort(option.key as typeof browseSort)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[250px,1fr]">
              <aside className={`${glassCardClass} space-y-4 text-sm lg:sticky lg:top-6 lg:self-start`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{t('Filter by cuisine')}</div>
                  <div className="flex gap-2">
                    <button className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors" onClick={handleCuisineSelectAll}>{t('All')}</button>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <button className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors" onClick={handleCuisineClear}>{t('Clear')}</button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    placeholder={t('Search cuisines')}
                    value={cuisineQuery}
                    onChange={e => setCuisineQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {filteredCuisineOptions.map(c => {
                    const key = normalizeCuisine(c);
                    const on = cuisineFilter[key] !== false;
                    return (
                      <label
                        key={c}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                          on
                            ? 'border-transparent bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{c}</span>
                          <span className="text-xs text-zinc-400">{cuisineCounts[key] ?? 0}</span>
                        </span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold ${on ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-zinc-400 text-transparent dark:border-zinc-600'}`}>
                          ✓
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={e => setCuisineFilter(prev => ({ ...prev, [key]: e.target.checked }))}
                        />
                      </label>
                    );
                  })}
                  {filteredCuisineOptions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                      {cuisineOptions.length
                        ? t('No cuisines match your search.')
                        : t('Add meals to build cuisine filters.')}
                    </div>
                  )}
                </div>
                {cuisineBatchSaving && (
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t('Applying bulk update…')}</div>
                )}
              </aside>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleBrowseEntries.map(entry => {
                  const normKey = entry.key;
                  const latest = entry.latest;
                  const isOff = !!coolOff[normKey];
                  const saving = coolSavingKey === normKey;
                  return (
                    <div
                      key={entry.key}
                      className={`${glassCardClass} flex h-full flex-col gap-3 transition ${
                        isOff
                          ? 'border-dashed border-emerald-200/70 bg-white/60 text-zinc-500 opacity-80 dark:border-emerald-400/40 dark:bg-zinc-900/40'
                          : 'bg-gradient-to-br from-white/95 via-white/75 to-emerald-50/40 hover:shadow-lg dark:from-zinc-900/80 dark:via-zinc-900/60 dark:to-emerald-900/30'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{displayTitle(latest.dish)}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">{displayTitle(latest.restaurant)} • {displayTitle(latest.cuisine, '—')}</div>
                        </div>
                        <span className={`flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${isOff ? 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300' : 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200'}`}>
                          {latest.rating ?? '—'}★
                        </span>
                      </div>
                      <div className="mt-3 rounded-2xl border border-white/50 bg-white/70 p-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-300">
                        <div className="flex items-center justify-between">
                          <span>{t('Last logged')}</span>
                          <span>{new Date(latest.date).toISOString().slice(0,10)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span>{t('Cost')}</span>
                          <span>{currency(latest.cost)}</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        {isOff ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{t('Disabled')}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-200">{t('Active')}</span>
                        )}
                        <div className="flex gap-2">
                          <button className="btn-primary" onClick={() => selectBrowseEntry(entry.key)}>{t('Select')}</button>
                          <button
                            className={`btn-outline ${isOff ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-300' : ''}`}
                            onClick={() => toggleDisabledKey(normKey)}
                            disabled={saving}
                          >
                            {saving ? t('Saving…') : isOff ? t('Enable') : t('Disable')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!visibleBrowseEntries.length && (
                  <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    {t('No meals match the current filters. Try adjusting your cuisine toggles or clearing the search.')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <React.Fragment>
      {/* Primary home layout */}
      <div className="grid gap-4 xl:grid-cols-[1.75fr,1fr]">
        <div className="space-y-4">
          <div className={`${panelClass} space-y-4`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold">{t('Mystery Egg')}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  {t('Let FuDi crack a surprise pick or browse your shortlist.')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost inline-flex items-center gap-1" onClick={openScoreHelp}>
                  <Info className="h-4 w-4" /> {t('Explain')}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    const next = !orderOpen;
                    setOrderOpen(next);
                    if (next) computeAppPick();
                  }}
                >
                  {orderOpen ? t('Hide shortlist') : t('See shortlist')}
                </button>
              </div>
            </div>
            <div
              className={`rounded-xl border p-4 transition-colors ${
                featuredIsMystery
                  ? 'bg-amber-50 border-amber-300 dark:bg-amber-300/15 dark:border-amber-200/40'
                  : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1 text-zinc-900 dark:text-zinc-100">
                  <div className="text-lg font-semibold flex items-center gap-2">
                    <Egg className="h-5 w-5" /> {t('Ready to crack?')}
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">
                    {t('FuDi will pick from your shortlist once you crack the egg.')}
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <button className="btn-primary" onClick={crackEgg}>
                    <Egg className="h-4 w-4" /> {t('Crack Mystery Egg')}
                  </button>
                  {rankedMeals.length > 0 && (
                    <button
                      className="btn-outline"
                      onClick={() => {
                        const topCandidate = rankedMeals[0]?.meal;
                        if (topCandidate) selectFromTopChoice(topCandidate);
                      }}
                    >
                      {t('Quick add top pick')}
                    </button>
                  )}
                </div>
              </div>
              {rankedMeals.length === 0 && (
                <div className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                  {t('Add a few saved meals to unlock your mystery egg.')}
                </div>
              )}
            </div>
            {orderOpen && (
              <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('Shortlist')}</div>
                {rankedMeals.slice(0,5).map((s, idx) => (
                  <div
                    key={s.meal.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm transition-colors dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700 dark:bg-amber-400/20 dark:text-amber-200">
                          #{idx + 1}
                        </span>
                        <span className="font-medium">
                          {displayTitle(s.meal.dish)}
                          <span className="text-zinc-500 dark:text-zinc-300"> • {displayTitle(s.meal.cuisine, '—')}</span>
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-300">
                        {displayTitle(s.meal.restaurant)} • {currency(s.meal.cost)}
                        {typeof s.meal.rating === 'number' && ` • ${s.meal.rating}★`}
                      </div>
                    </div>
                    <button className="btn-primary" onClick={() => selectFromTopChoice(s.meal)}>{t('Select')}</button>
                  </div>
                ))}
                {!rankedMeals.length && (
                  <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-300">
                    {t('No saved meals yet—log a few to build your shortlist.')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Log Entry (Meal | Grocery Trip) */}
          <div className={`${panelClass} space-y-4`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">{t('Log')}</div>
              <div className="flex gap-2">
                <button className={rangeButtonClass(logTab==='meal')} onClick={()=> setLogTab('meal')}>{t('Meal')}</button>
                <button className={rangeButtonClass(logTab==='grocery')} onClick={()=> setLogTab('grocery')}>{t('Grocery Trip')}</button>
                <button className={rangeButtonClass(logTab==='travel')} onClick={()=> setLogTab('travel')}>{t('Travel')}</button>
              </div>
            </div>
        {logTab==='meal' ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="label">{t('Date')}</div>
                <input className="input" type="date" value={date} onChange={e=> setDate(e.target.value)} />
              </div>
              <div>
                <div className="label">{t('Cost (USD)')}</div>
                <input className="input" type="number" value={cost} onChange={e=> setCost(e.target.value)} />
              </div>
              <div>
                <div className="label">{t('Cuisine')}</div>
                <input className="input" list="cuisine-list" value={cuisineInput} onChange={e=> setCuisineInput(e.target.value)} />
                <datalist id="cuisine-list">
                  {['Mexican','Japanese','Italian','American','Thai','Indian','Ramen','Pho','Curry','Salad', ...cuisines].filter((v,i,a)=> a.indexOf(v)===i).map(c=> <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <div className="label">{t('Restaurant')}</div>
                <input className="input" list="restaurant-list" value={restaurant} onChange={e=> setRestaurant(e.target.value)} placeholder="e.g., Chipotle" />
                <datalist id="restaurant-list">{restaurantOptions.map(r => <option key={r} value={r} />)}</datalist>
              </div>
              <div>
                <div className="label">{t('Dish')}</div>
                <input className="input" list="dish-list" value={dish} onChange={e=> setDish(e.target.value)} placeholder="e.g., Burrito Bowl" />
                <datalist id="dish-list">{dishOptions.map(d => <option key={d} value={d} />)}</datalist>
              </div>
              <div>
                <div className="label">{t('Rating')} (1-5)</div>
                <input className="input" type="number" min={1} max={5} value={rating} onChange={e=> setRating(Math.max(1, Math.min(5, Number(e.target.value)||1)))} />
              </div>
              <div>
                <div className="label">{t('Who Paid?')}</div>
                <input className="input" value={mealPurchaserName} onChange={e=> setMealPurchaserName(e.target.value)} placeholder="e.g., Ryan, Rachel" />
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <div className="label">{t('Notes')}</div>
                <textarea className="input" rows={2} value={notes} onChange={e=> setNotes(e.target.value)} placeholder="Any context, cravings, mood…" />
              </div>
              <label className="md:col-span-2 lg:col-span-3 mt-1 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={seedFlag} onChange={e=> setSeedFlag(e.target.checked)} />
                {t("Mark as seed (won't count toward spend)")}
              </label>
            </div>
            <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={submitMeal}>{t('Save Meal')}</button></div>
          </>
        ) : logTab==='grocery' ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <div className="label">{t('Date')}</div>
                <input className="input" type="date" value={gDate} onChange={e=> setGDate(e.target.value)} />
              </div>
              <div>
                <div className="label">{t('Amount (USD)')}</div>
                <input className="input" type="number" value={gAmount} onChange={e=> setGAmount(e.target.value)} />
              </div>
              <div>
                <div className="label">{t('Who Paid?')}</div>
                <input className="input" value={groceryPurchaserName} onChange={e=> setGroceryPurchaserName(e.target.value)} placeholder="e.g., Ryan, Rachel" />
              </div>
              <div className="relative">
                <div className="label">{t('Store')}</div>
                <input
                  className="input"
                  value={gStore}
                  onChange={e=> {
                    setGStore(e.target.value);
                    setShowStoreDropdown(e.target.value.trim().length > 0);
                    setSelectedStoreIndex(-1);
                  }}
                  onFocus={() => setShowStoreDropdown(gStore.trim().length > 0)}
                  onBlur={() => setTimeout(() => setShowStoreDropdown(false), 200)}
                  onKeyDown={(e) => {
                    if (!showStoreDropdown || filteredStores.length === 0) return;

                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedStoreIndex(prev =>
                        prev < filteredStores.length - 1 ? prev + 1 : 0
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedStoreIndex(prev =>
                        prev > 0 ? prev - 1 : filteredStores.length - 1
                      );
                    } else if (e.key === 'Enter' && selectedStoreIndex >= 0) {
                      e.preventDefault();
                      setGStore(filteredStores[selectedStoreIndex]);
                      setShowStoreDropdown(false);
                      setSelectedStoreIndex(-1);
                    } else if (e.key === 'Escape') {
                      setShowStoreDropdown(false);
                      setSelectedStoreIndex(-1);
                    }
                  }}
                  placeholder="e.g., Trader Joe's"
                />
                {showStoreDropdown && filteredStores.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredStores.map((store, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`block w-full px-3 py-2 text-left hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none ${
                          index === selectedStoreIndex ? 'bg-zinc-100' : ''
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setSelectedStoreIndex(index)}
                        onClick={() => {
                          setGStore(store);
                          setShowStoreDropdown(false);
                          setSelectedStoreIndex(-1);
                        }}
                      >
                        {store}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {editGrocery && (
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setEditGrocery(null);
                    setGDate(todayISO()); setGAmount('50'); setGStore(''); setGroceryPurchaserName(displayName || '');
                    setShowStoreDropdown(false);
                    setSelectedStoreIndex(-1);
                  }}
                >
                  {t('Cancel')}
                </button>
              )}
              <button
                className="btn-primary"
                onClick={async () => {
                  if (editGrocery) {
                    await saveGroceryEdit();
                    return;
                  }
                  const amt = Number(gAmount) || 0;
                  if (amt <= 0) { showToast(t('Enter a valid amount')); return; }
                  await FoodChooserAPI.addGrocery(householdId!, {
                    date: toLocalISOString(gDate),
                    amount: amt,
                    notes: gStore || null,
                    purchaser_name: groceryPurchaserName.trim() || 'Unknown'
                  });
                  const latest = await FoodChooserAPI.getGroceries(householdId!);
                  setGroceries(latest);
                  setGDate(todayISO()); setGAmount('50'); setGStore(''); setGroceryPurchaserName(displayName || '');
                  showToast(t('Grocery trip saved'));
                }}
              >
                {editGrocery ? t('Save Changes') : t('Save Trip')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <div className="label">{t('Date')}</div>
                <input className="input" type="date" value={travelDate} onChange={e => setTravelDate(e.target.value)} />
              </div>
              <div>
                <div className="label">{t('Amount (USD)')}</div>
                <input className="input" type="number" value={travelAmount} onChange={e => setTravelAmount(e.target.value)} />
              </div>
              <div>
                <div className="label">{t('Travel Tag')}</div>
                <input className="input" value={travelTag} onChange={e => setTravelTag(e.target.value)} placeholder={t('e.g., Europe 2025')} />
              </div>
              <div>
                <div className="label">{t('Who Paid?')}</div>
                <input className="input" value={travelPurchaserName} onChange={e => setTravelPurchaserName(e.target.value)} placeholder="e.g., Ryan, Rachel" />
              </div>
              <div className="md:col-span-4">
                <div className="label">{t('Notes')}</div>
                <textarea
                  className="input"
                  rows={3}
                  value={travelNotes}
                  onChange={e => setTravelNotes(e.target.value)}
                  placeholder={t('List what you covered: meals, rides, local transit. Skip shipping, plane tickets, and hotels.')}
                />
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {t('Keep this for on-the-ground costs only—no shipping, plane tickets, or hotel fares.')}
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                className="btn-primary"
                disabled={travelSaving}
                onClick={async () => {
                  const amt = Number(travelAmount) || 0;
                  if (amt <= 0) { showToast(t('Enter a valid amount')); return; }
                  const tag = travelTag.trim();
                  if (!tag) { showToast(t('Add a travel tag first.')); return; }
                  try {
                    setTravelSaving(true);
                    await FoodChooserAPI.addGrocery(householdId!, {
                      date: toLocalISOString(travelDate),
                      amount: amt,
                      notes: travelNotes.trim() || null,
                      trip_label: tag,
                      purchaser_name: travelPurchaserName.trim() || 'Unknown'
                    });
                    const latest = await FoodChooserAPI.getGroceries(householdId!);
                    setGroceries(latest);
                    setTravelAmount('100');
                    setTravelTag('');
                    setTravelPurchaserName(displayName || '');
                    setTravelNotes('');
                    showToast(t('Travel spend saved'));
                  } catch (err) {
                    console.error('Travel save failed', err);
                    showToast(t('Failed to save travel spend'));
                  } finally {
                    setTravelSaving(false);
                  }
                }}
              >
                {travelSaving ? t('Saving…') : t('Save Travel Log')}
              </button>
            </div>
          </>
        )}
        {/* Shared History section */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">{t('History')}</div>
            <button className="btn-ghost" onClick={()=> setShowAllHistory(v=>!v)}>{showAllHistory ? t('View Last 5') : t('View All')}</button>
      </div>
        <div className="overflow-x-auto">
              {logTab==='meal' ? (
          <table className="table">
            <thead>
              <tr className="bg-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                <th className="th text-left">{t('Date')}</th>
                <th className="th text-left">{t('Cuisine')}</th>
                <th className="th text-left">{t('Restaurant')}</th>
                <th className="th text-left">{t('Dish')}</th>
                <th className="th text-right">{t('Cost')}</th>
                <th className="th text-center">{t('Who Paid?')}</th>
                <th className="th text-center">{t('Rating')}</th>
                <th className="th text-center">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
                  {(showAllHistory ? meals : meals.slice(0,5)).map(m => (
                <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <td className="td">{m.date.slice(0,10)} {isSeedMeal(m) && <span className="text-amber-700">(seed)</span>}</td>
                      <td className="td">{displayTitle(m.cuisine, '—')}</td>
                      <td className="td">{displayTitle(m.restaurant, '—')}</td>
                      <td className="td">{displayTitle(m.dish)}</td>
                  <td className="td text-right">{currency(m.cost)}</td>
                  <td className="td text-center">
                    <span className={`px-2 py-1 rounded text-xs ${
                      m.purchaser_name === 'Ryan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100' :
                      m.purchaser_name === 'Rachel' ? 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-100' :
                      'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-100'
                    }`}>
                      {m.purchaser_name || 'Unknown'}
                    </span>
                  </td>
                  <td className="td text-center">{m.rating ?? '—'}</td>
                  <td className="td text-center">
                        <button className="btn-ghost" onClick={()=> startEdit(m)}>{t('Edit')}</button>
                        <button className="btn-ghost" onClick={()=> deleteHistory(m.id)}>{t('Delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            ) : logTab==='grocery' ? (
              <table className="table">
                <thead>
                  <tr className="bg-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                    <th className="th text-left">{t('Date')}</th>
                    <th className="th text-left">{t('Store')}</th>
                    <th className="th text-right">{t('Amount (USD)')}</th>
                    <th className="th text-center">{t('Who Paid?')}</th>
                    <th className="th text-center">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllHistory ? groceryEntries : groceryEntries.slice(0,5)).map(g => (
                    <tr key={g.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <td className="td">{g.date.slice(0,10)}</td>
                      <td className="td">{g.notes ?? '—'}</td>
                      <td className="td text-right">{currency(g.amount)}</td>
                      <td className="td text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          g.purchaser_name === 'Ryan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100' :
                          g.purchaser_name === 'Rachel' ? 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-100' :
                          'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-100'
                        }`}>
                          {g.purchaser_name || 'Unknown'}
                        </span>
                      </td>
                      <td className="td text-center">
                        <div className="flex justify-center gap-1">
                          <button className="btn-ghost" onClick={()=> startEditGrocery(g)}>{t('Edit')}</button>
                          <button className="btn-ghost" onClick={()=> deleteGroceryHistory(g.id)}>{t('Delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="table">
                <thead>
                  <tr className="bg-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                    <th className="th text-left">{t('Date')}</th>
                    <th className="th text-left">{t('Tag')}</th>
                    <th className="th text-left">{t('Notes')}</th>
                    <th className="th text-right">{t('Amount (USD)')}</th>
                    <th className="th text-center">{t('Who Paid?')}</th>
                    <th className="th text-center">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllHistory ? travelEntries : travelEntries.slice(0,5)).map(entry => (
                    <tr key={entry.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <td className="td">{entry.date.slice(0,10)}</td>
                      <td className="td">{entry.trip_label ?? '—'}</td>
                      <td className="td">{entry.notes ?? '—'}</td>
                      <td className="td text-right">{currency(entry.amount)}</td>
                      <td className="td text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          entry.purchaser_name === 'Ryan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-100' :
                          entry.purchaser_name === 'Rachel' ? 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-100' :
                          'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-100'
                        }`}>
                          {entry.purchaser_name || 'Unknown'}
                        </span>
                      </td>
                      <td className="td text-center">
                        <div className="flex justify-center gap-1">
                          <button className="btn-ghost" onClick={()=> deleteTravelEntry(entry.id)}>{t('Delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
      </div>
      </div>

        <div className="space-y-4">
          <div className={`${panelClass} space-y-4`}>
            <div className="space-y-1 mb-3">
              <div className="text-sm font-semibold">{t("Your Snapshot")}</div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} • {wx.tempF}°F {weatherIcon(wx.condition)} {locationName}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="label">{t('Condition')}</div>
                <div className="flex items-center gap-1 text-lg font-semibold capitalize">
                  {weatherIcon(wx.condition)} <span>{wx.condition}</span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">{locationName || t('Location unavailable')}</div>
              </div>
              <div>
                <div className="label">{t('Temp')}</div>
                <div className="text-lg font-semibold">{wx.tempF}°F</div>
              </div>
              <div>
                <div className="label">{t('Month-to-date Spend')}</div>
                <button
                  className="text-left text-lg font-semibold underline decoration-dotted"
                  onClick={() => {
                    setSpendSelection(monthKey(new Date()));
                    setSpendOpen(true);
                  }}
                >
                  {currency(totalSpendCurrentMonth)}
                </button>
              </div>
            </div>
            <div className={`${glassCardClass} mt-4 h-[120px] bg-gradient-to-r from-white/90 via-white/70 to-emerald-50/40 dark:from-zinc-900/80 dark:via-zinc-900/60 dark:to-emerald-900/20`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3f3f46' : '#e4e4e7'} />
                  <XAxis dataKey="day" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', border: '1px solid', borderColor: theme === 'dark' ? '#3f3f46' : '#e5e7eb', color: theme === 'dark' ? '#e4e4e7' : '#0f172a' }}
                    cursor={{ stroke: theme === 'dark' ? '#52525b' : '#d4d4d8' }}
                  />
                  <Line type="monotone" dataKey="spend" strokeWidth={2} dot={false} stroke={theme === 'dark' ? '#38bdf8' : '#2563eb'} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {monthlyBudgetSaved !== null && monthlyBudgetSaved > 0 && (() => {
              const spentMeals = totalSpendMonth();
              const spentGroceries = totalGroceryMonth();
              const spent = spentMeals + spentGroceries;
              const remaining = Math.max(0, monthlyBudgetSaved - spent);
              const pct = Math.min(100, Math.round((spent / monthlyBudgetSaved) * 100));
              return (
                <div className="mt-5 space-y-3 text-xs">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className={glassCardClass}>
                      <div className="text-zinc-600 dark:text-zinc-300">{t('Total')}</div>
                      <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{currency(monthlyBudgetSaved)}</div>
                    </div>
                    <div className={glassCardClass}>
                      <div className="text-zinc-600 dark:text-zinc-300">{t('Spent MTD')}</div>
                      <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{currency(spent)}</div>
                      <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                        {t('Meals')}: {currency(spentMeals)} • {t('Groceries')}: {currency(spentGroceries)}
                      </div>
                    </div>
                    <div className={glassCardClass}>
                      <div className="text-zinc-600 dark:text-zinc-300">{t('Remaining')}</div>
                      <div className={`mt-1 text-base font-semibold ${spent > monthlyBudgetSaved ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-200'}`}>
                        {currency(Math.max(0, remaining))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                      <span>{t('Usage')}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800 relative overflow-hidden">
                      <div className="absolute left-0 top-0 h-2 bg-emerald-500" style={{ width: `${Math.min(100, Math.round((spentMeals / monthlyBudgetSaved) * 100))}%` }} />
                      <div className="absolute left-0 top-0 h-2 bg-blue-500" style={{ width: `${Math.min(100, Math.round(((spentMeals + spentGroceries) / monthlyBudgetSaved) * 100))}%`, opacity: 0.6 }} />
                    </div>
                    <div className="mt-1 flex justify-end gap-3 text-[11px] text-zinc-600 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 bg-emerald-500"></span> {t('Meals')}</span>
                      <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 bg-blue-500 opacity-60"></span> {t('Groceries')}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className={`${panelClass} space-y-4`}>
            <div className="text-sm font-semibold mb-1">{t('Preferences & budget')}</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="label">{t('Min')}</div>
                <input className="input" type="number" value={budgetDraft.min} onChange={e => setBudgetDraft(prev => ({ ...prev, min: e.target.value }))} />
              </div>
              <div>
                <div className="label">{t('Max')}</div>
                <input className="input" type="number" value={budgetDraft.max} onChange={e => setBudgetDraft(prev => ({ ...prev, max: e.target.value }))} />
              </div>
            </div>
            <div className="mb-3">
              <div className="label">{t('Monthly budget')}</div>
              <input className="input" type="number" placeholder="e.g., 600" value={monthlyBudgetDraft} onChange={e => setMonthlyBudgetDraft(e.target.value)} />
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">{tt('Saved: {min} – {max}', { min: currency(budgetSaved.min), max: currency(budgetSaved.max) })}</div>
            <div className="mt-4 text-sm font-semibold">{t('Egg tiers')}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {eggEligibility.map(tier => (
                <div key={tier.name} className="flex items-start justify-between rounded border px-2 py-2 dark:border-zinc-700">
                  <div className="flex flex-col">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{tier.name}</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{tier.rangeLabel}</span>
                    {!tier.eligible && tier.tip && <span className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{tier.tip}</span>}
                  </div>
                  <span className={`badge ${tier.eligible ? tier.badge : 'border-zinc-300 text-zinc-500 dark:border-zinc-600 dark:text-zinc-300'}`}>{tier.eligible ? t('Eligible') : t('Not eligible')}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm">No repeat within (days)</div>
            <select className="select mt-1" value={forbidRepeatDaysDraft} onChange={e => setForbidRepeatDaysDraft(e.target.value)}>
              {Array.from({ length: 15 }, (_, i) => i).map(n => (
                <option key={n} value={String(n)}>
                  {n === 0 ? t('0 (allow repeats)') : n}
                </option>
              ))}
            </select>
            {prefsError && <div className="mt-2 text-sm text-red-600">{prefsError}</div>}
            {prefsSavedNotice && <div className="mt-2 text-sm text-green-700">{prefsSavedNotice}</div>}
            {(isPrefsDirty || prefsSaving) && (
              <div className="mt-3 flex justify-end">
                <button className="btn-primary" onClick={savePreferences} disabled={prefsSaving || !isPrefsDirty}>
                  {prefsSaving ? t('Saving…') : t('Save Preferences')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations removed per request to simplify Home */}

      {/* Scoring explain modal */}
      {scoreHelpOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setScoreHelpOpen(false)}>
          <div className={`${panelClass} w-full max-w-lg shadow-2xl dark:shadow-lg`} onClick={e=> e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold"><Info className="h-5 w-5"/> {t('How we ranked your top choice')}</div>
            <pre className="whitespace-pre-wrap rounded bg-zinc-100 p-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">{scoreHelpText}</pre>
            <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={()=> setScoreHelpOpen(false)}>{t('Close')}</button></div>
          </div>
        </div>
      )}

      {/* (Removed) Separate bottom History card; History now lives under Log card */}

      {/* Edit history modal */}
      {editMeal && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setEditMeal(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={e=> e.stopPropagation()}>
            <div className="mb-2 text-lg font-semibold">Edit Dinner Entry</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><div className="label">Date</div><input className="input" type="datetime-local" value={new Date(editMeal.date).toISOString().slice(0,16)} onChange={e=> setEditMeal({...editMeal, date: toLocalISOString(e.target.value.slice(0,10)) })} /></div>
              <div><div className="label">Cost</div><input className="input" type="number" value={String(editMeal.cost)} onChange={e=> setEditMeal({...editMeal, cost: Number(e.target.value)||0})} /></div>
              <div><div className="label">Cuisine</div><input className="input" value={editMeal.cuisine} onChange={e=> setEditMeal({...editMeal, cuisine: e.target.value})} /></div>
              <div><div className="label">Restaurant</div><input className="input" value={editMeal.restaurant ?? ''} onChange={e=> setEditMeal({...editMeal, restaurant: e.target.value||null})} /></div>
              <div><div className="label">Dish</div><input className="input" value={editMeal.dish} onChange={e=> setEditMeal({...editMeal, dish: e.target.value})} /></div>
              <div><div className="label">Rating</div><input className="input" type="number" min={1} max={5} value={String(editMeal.rating ?? '')} onChange={e=> setEditMeal({...editMeal, rating: e.target.value? Number(e.target.value): null})} /></div>
              <div><div className="label">Who Paid?</div><input className="input" value={editMeal.purchaser_name ?? ''} onChange={e=> setEditMeal({...editMeal, purchaser_name: e.target.value||'Unknown'})} placeholder="e.g., Ryan, Rachel" /></div>
              <div><div className="label">Notes</div><textarea className="input" rows={2} value={editMeal.notes ?? ''} onChange={e=> setEditMeal({...editMeal, notes: e.target.value||null})} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={()=> setEditMeal(null)}>Cancel</button><button className="btn-primary" disabled={editSaving} onClick={saveEdit}>{editSaving ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}

      {/* Spend drilldown modal */}
      {spendOpen && (() => {
        // Build fixed 6-month window data starting from spendWindowStart
        const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const [y, m] = spendWindowStart.split('-').map(Number);
        const windowMonths: string[] = Array.from({ length: 6 }, (_, i) => monthKey(new Date((y||1970), (m||1)-1 + i, 1)));
        const monthMapMeals = new Map<string, number>();
        const monthMapGroceries = new Map<string, number>();
        const monthMapTravel = new Map<string, number>();
        for (const mm of windowMonths) {
          monthMapMeals.set(mm, 0);
          monthMapGroceries.set(mm, 0);
          monthMapTravel.set(mm, 0);
        }
        for (const meal of meals) {
          const k = getLocalMonthKey(meal.date.slice(0,10));
          if (windowMonths.includes(k) && !isSeedMeal(meal)) monthMapMeals.set(k, (monthMapMeals.get(k) ?? 0) + meal.cost);
        }
        for (const g of groceries) {
          const k = getLocalMonthKey(g.date.slice(0,10));
          if (windowMonths.includes(k)) {
            const isTravel = (g.trip_label ?? '').trim().length > 0;
            if (isTravel) {
              monthMapTravel.set(k, (monthMapTravel.get(k) ?? 0) + g.amount);
            } else {
              monthMapGroceries.set(k, (monthMapGroceries.get(k) ?? 0) + g.amount);
            }
          }
        }
        const monthData = windowMonths.map(k => ({
          month: k,
          meals: Math.round((monthMapMeals.get(k) ?? 0)*100)/100,
          groceries: Math.round((monthMapGroceries.get(k) ?? 0)*100)/100,
          travel: Math.round((monthMapTravel.get(k) ?? 0)*100)/100,
        }));
        const totalMealsWindow = monthData.reduce((s, d) => s + d.meals, 0);
        const totalGroceriesWindow = monthData.reduce((s, d) => s + d.groceries, 0);
        const totalTravelWindow = monthData.reduce((s, d) => s + d.travel, 0);
        const totalWindow = Math.round((totalMealsWindow + totalGroceriesWindow + totalTravelWindow) * 100) / 100;
        const selectedMonth = windowMonths.includes(spendSelection || '') ? (spendSelection as string) : windowMonths[5];
        const contributingMeals = meals.filter(m => getLocalMonthKey(m.date.slice(0,10))===selectedMonth && !isSeedMeal(m));
        const contributingGroceries = groceries.filter(g => {
          const sameMonth = getLocalMonthKey(g.date.slice(0,10)) === selectedMonth;
          const isTravel = (g.trip_label ?? '').trim().length > 0;
          return sameMonth && !isTravel;
        });
        const contributingTravel = groceries.filter(g => {
          const sameMonth = getLocalMonthKey(g.date.slice(0,10)) === selectedMonth;
          const isTravel = (g.trip_label ?? '').trim().length > 0;
          return sameMonth && isTravel;
        });
        function sortByDateDesc<T extends { date: string }>(items: T[]): T[] {
          return items.slice().sort((a,b)=> +new Date(b.date) - +new Date(a.date));
        }
        const travelEntries = sortByDateDesc(contributingTravel);
        const groceryEntries = sortByDateDesc(contributingGroceries);
        const mealEntries = sortByDateDesc(contributingMeals);
        const hasSpendEntries = travelEntries.length > 0 || groceryEntries.length > 0 || mealEntries.length > 0;
        return (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setSpendOpen(false)}>
            <div className={`${panelClass} w-full max-w-3xl shadow-2xl dark:shadow-lg`} onClick={e=> e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">{t('Spend')}</div>
                <div className="flex gap-2">
                  <button className="btn-ghost" title={t('Previous 6 months')} onClick={()=> {
                    // move window back by 1 month
                    const [yy, mm] = spendWindowStart.split('-').map(Number);
                    const prev = new Date((yy||1970), (mm||1)-2, 1);
                    setSpendWindowStart(`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`);
                    setSpendSelection(null);
                  }}>{language === 'zh' ? '◀ 6 個月' : '◀ 6mo'}</button>
                  <div className="rounded border px-2 py-1 text-sm dark:border-zinc-700" title={t('Currently viewing a 6-month window')}>{windowMonths[0]} — {windowMonths[5]}</div>
                  <button className="btn-ghost" title={t('Next 6 months')} onClick={()=> {
                    // move window forward by 1 month
                    const [yy, mm] = spendWindowStart.split('-').map(Number);
                    const next = new Date((yy||1970), (mm||1), 1);
                    setSpendWindowStart(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`);
                    setSpendSelection(null);
                  }}>{language === 'zh' ? '6 個月 ▶' : '6mo ▶'}</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className={`${glassCardClass} h-[220px] bg-gradient-to-br from-white/90 via-white/70 to-emerald-50/40 dark:from-zinc-900/80 dark:via-zinc-900/60 dark:to-emerald-900/20`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthData} onClick={(e:any)=> { if (e && e.activeLabel) setSpendSelection(e.activeLabel); }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3f3f46' : '#e4e4e7'} opacity={0.7} />
                          <XAxis dataKey="month" stroke={theme === 'dark' ? '#d4d4d8' : '#3f3f46'} tick={{ fill: theme === 'dark' ? '#d4d4d8' : '#3f3f46' }} />
                          <YAxis stroke={theme === 'dark' ? '#d4d4d8' : '#3f3f46'} tick={{ fill: theme === 'dark' ? '#d4d4d8' : '#3f3f46' }} />
                          <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', color: theme === 'dark' ? '#e4e4e7' : '#0f172a', border: '1px solid', borderColor: theme === 'dark' ? '#3f3f46' : '#e5e7eb' }} labelStyle={{ color: theme === 'dark' ? '#e4e4e7' : '#0f172a' }} />
                          <Bar dataKey="groceries" stackId="a" fill="#22c55e" />
                          <Bar dataKey="meals" stackId="a" fill="#f97316" />
                          <Bar dataKey="travel" stackId="a" fill="#0ea5e9" />
                        </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>{t('Groceries')}</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-500"></span>{t('Meals')}</span>
                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500"></span>{t('Travel')}</span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">{t('Total (6 mo)')}</span>
                      <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{currency(totalWindow)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                        {t('Groceries')}
                      </span>
                      <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{currency(Math.round(totalGroceriesWindow*100)/100)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500"></span>
                        {t('Meals')}
                      </span>
                      <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{currency(Math.round(totalMealsWindow*100)/100)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500"></span>
                        {t('Travel')}
                      </span>
                      <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{currency(Math.round(totalTravelWindow*100)/100)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">{selectedMonth}</div>
                  </div>
                  <div className={`${glassCardClass} max-h-[220px] overflow-auto bg-white/90 dark:bg-zinc-900/80`}>
                    {!hasSpendEntries ? (
                      <div className="p-3 text-sm text-zinc-600 dark:text-zinc-300">{t('No spend in this month.')}</div>
                    ) : (
                      <>
                        {travelEntries.length > 0 && (
                          <div className="border-b border-zinc-200 pb-2 dark:border-zinc-700">
                            <div className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">{t('Travel')}</div>
                            {travelEntries.map(g => (
                              <div key={`t-${g.id}`} className="flex items-center justify-between border-t py-2 text-sm first:border-t-0 dark:border-zinc-700">
                                <div>
                                  <div className="font-medium text-zinc-900 dark:text-zinc-100">{(g.trip_label ?? '').trim() || t('Travel')}</div>
                                  <div className="text-xs text-zinc-600 dark:text-zinc-300">{(g.notes ?? '—')} • {g.date.slice(0,10)}</div>
                                </div>
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{currency(g.amount)}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {groceryEntries.length > 0 && (
                          <div className={`${travelEntries.length ? 'mt-2' : ''} border-b border-zinc-200 pb-2 dark:border-zinc-700`}>
                            <div className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">{t('Groceries')}</div>
                            {groceryEntries.map(g => (
                              <div key={`g-${g.id}`} className="flex items-center justify-between border-t py-2 text-sm first:border-t-0 dark:border-zinc-700">
                                <div>
                                  <div className="font-medium text-zinc-900 dark:text-zinc-100">{t('Grocery')}</div>
                                  <div className="text-xs text-zinc-600 dark:text-zinc-300">{g.notes ?? '—'} • {g.date.slice(0,10)}</div>
                                </div>
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{currency(g.amount)}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {mealEntries.length > 0 && (
                          <div className={`${travelEntries.length || groceryEntries.length ? 'mt-2' : ''}`}>
                            <div className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-300">{t('Meals')}</div>
                            {mealEntries.map(m => (
                              <div key={`m-${m.id}`} className="flex items-center justify-between border-t py-2 text-sm first:border-t-0 dark:border-zinc-700">
                                <div>
                                  <div className="font-medium text-zinc-900 dark:text-zinc-100">{displayTitle(m.dish)} <span className="text-zinc-500 dark:text-zinc-300">• {displayTitle(m.cuisine, '—')}</span></div>
                                  <div className="text-xs text-zinc-600 dark:text-zinc-300">{displayTitle(m.restaurant)} • {m.date.slice(0,10)}</div>
                                </div>
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{currency(m.cost)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={()=> setSpendOpen(false)}>{t('Close')}</button></div>
            </div>
          </div>
        );
      })()}

          </React.Fragment>
        )}
        </div>

        <EggGacha
          open={eggOpen}
          pick={picked}
          onClose={() => setEggOpen(false)}
          onOrder={handleOrder}
          confirmLabel={isOverride ? t('Choose & Save') : t('Save to Meal History')}
          translate={t}
        />
      </div>

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 transform">
          <div className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
            {toast.message}
          </div>
        </div>
      )}

      {confirmDialog && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 px-4 backdrop-blur"
          onClick={() => closeConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/95 p-5 shadow-2xl transition dark:border-zinc-700 dark:bg-zinc-900/95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{confirmDialog.title}</div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{confirmDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => closeConfirm(false)}>
                {confirmDialog.cancelLabel}
              </button>
              <button
                autoFocus
                className={`btn-primary ${confirmDialog.tone === 'danger' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-400' : ''}`}
                onClick={() => closeConfirm(true)}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function weatherIcon(cond: Weather['condition']): string {
  switch (cond) {
    case 'hot': return '☀️';
    case 'rain': return '🌧️';
    case 'cold': return '❄️';
    default: return '⛅';
  }
}
