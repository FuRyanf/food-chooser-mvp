import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Egg, Filter, History, Info, Moon, Sparkles, Sun, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import EggGacha from "./components/EggGacha";
import { FoodChooserAPI } from './lib/api';
import type { Database } from './lib/supabase';
import { createPortal } from 'react-dom';

type Meal = Database['public']['Tables']['meals']['Row'];
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

const currency = (n:number)=> `$${n.toFixed(2)}`;

const THEME_STORAGE_KEY = 'fudi.theme';

function resolveInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
  const res = await fetch(url);
  const data = await res.json();
  const t = Number(data?.current_weather?.temperature ?? 70);
  const code = Number(data?.current_weather?.weathercode ?? 0);
  const condition = mapWeatherCodeToCondition(code, t);
  return { condition, tempF: t };
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

const seedMeals: Omit<Meal, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
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

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  const isDarkTheme = theme === 'dark';

  // Tabs: Home (default), Browse, Contributions, and How
  const [activeTab, setActiveTab] = useState<'home'|'browse'|'contributions'|'how'>('home');
  const [browseSearch, setBrowseSearch] = useState('');
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
  // Groceries state
  type Grocery = Database['public']['Tables']['groceries']['Row'];
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [gDate, setGDate] = useState<string>(todayISO());
  const [gAmount, setGAmount] = useState<string>('50');
  const [gStore, setGStore] = useState<string>('');
  const [showStoreDropdown, setShowStoreDropdown] = useState<boolean>(false);
  const [selectedStoreIndex, setSelectedStoreIndex] = useState<number>(-1);
  useEffect(() => {
    // Load disabled items from Supabase
    (async () => {
      try {
        const map = await FoodChooserAPI.getDisabledItems();
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
        FoodChooserAPI.getMeals(),
        FoodChooserAPI.getUserPreferences(),
        FoodChooserAPI.getOverridesMap(),
        FoodChooserAPI.getGroceries()
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
    if (!isFinite(min) || !isFinite(max)) { setPrefsError('Please enter valid numeric min and max.'); return; }
    if (min < 0 || max < 0) { setPrefsError('Min and Max must be non-negative.'); return; }
    if (max < min) { setPrefsError('Max must be greater than or equal to Min.'); return; }
    if (!Number.isInteger(days) || days < 0 || days > 14) { setPrefsError('No repeat within days must be an integer between 0 and 14.'); return; }
    if (monthlyBudget !== null && (!isFinite(monthlyBudget) || monthlyBudget < 0)) { setPrefsError('Monthly budget must be a non-negative number.'); return; }
    try {
      setPrefsSaving(true);
      const saved = await FoodChooserAPI.upsertUserPreferences({
        budget_min: min,
        budget_max: max,
        forbid_repeat_days: days,
        strict_budget: true,
        monthly_budget: monthlyBudget
      });
      setBudgetSaved({ min: saved.budget_min, max: saved.budget_max });
      setForbidRepeatDaysSaved(saved.forbid_repeat_days);
      setMonthlyBudgetSaved(saved.monthly_budget ?? null);
      setPrefsSavedNotice('Preferences saved.');
    } catch (e) {
      console.error('Failed to save preferences', e);
      setPrefsError('Failed to save preferences.');
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
          try { const w = await fetchWeather(pos.coords.latitude, pos.coords.longitude); setWx(w); } 
          catch { fallback(); }
          try {
            const name = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            if (name) setLocationName(name);
            else {
              const ipCity = await ipCityFallback();
              setLocationName(ipCity ?? 'City unavailable');
            }
          } catch {
            const ipCity = await ipCityFallback();
            setLocationName(ipCity ?? 'City unavailable');
          }
        },
        ()=> fallback(),
        { enableHighAccuracy: true, timeout: 5000 }
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
    try { for (const meal of seedMeals) { await FoodChooserAPI.addMeal(meal); } await loadData(); }
    catch (err) { setError('Failed to load demo data'); }
  }

  async function addMeal(mealData: Omit<Meal, 'id' | 'user_id' | 'created_at' | 'updated_at'>){
    try { const newMeal = await FoodChooserAPI.addMeal(mealData); setMeals(prev => [newMeal, ...prev].sort((a,b)=> +new Date(b.date) - +new Date(a.date))); }
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
    showToast('Logged to Meal History');
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
    showToast('Logged to Meal History');
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
    showToast('Selected! Added to your Meal History.');
  }
  async function selectBrowseEntry(key: string){
    await addBrowseEntryToHistory(key);
    showToast('Selected! Added to your Meal History.');
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
  const [purchaserName, setPurchaserName] = useState<string>('');
  const [logTab, setLogTab] = useState<'meal'|'grocery'>('meal');
  // Contributions tab state
  const [contributionsDateRange, setContributionsDateRange] = useState<'mtd' | 'all' | 'custom'>('mtd');
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
      purchaser_name: purchaserName.trim() || 'Unknown'
    };
    await addMeal(mealData);
    setDate(todayISO()); setRestaurant(''); setDish(''); setCuisineInput('Mexican'); setCost('15'); setRating(4); setNotes(''); setSeedFlag(false); setPurchaserName('');
  }

  async function handleOrder(rec: Recommendation) {
    try {
      setError(null);
      const mealData = { date: new Date().toISOString(), restaurant: rec.suggestedRestaurant || null, dish: rec.dish ?? rec.label, cuisine: rec.label, cost: rec.estCost, rating: null, notes: null, seed_only: false, purchaser_name: 'Unknown' };
      await addMeal(mealData);
      if (isOverride) { const newCount = (overrides[rec.label] ?? 0) + 1; await FoodChooserAPI.upsertCuisineOverride(rec.label, newCount); }
    setIsOverride(false);
    } catch (err) { console.error('Error handling order:', err); setError('Failed to save meal'); }
  }

  function openScoreHelp() {
    if (!rankedMeals.length) return;
    const top = rankedMeals[0];
    const b = top.breakdown;
    const lines = [
      `Rating weight: ${b.ratingWeight.toFixed(1)}`,
      `Recency penalty: ${b.recencyPenalty.toFixed(1)}`,
      `Budget fit: ${b.budgetFit.toFixed(1)}`,
      `Weather bonus: ${b.weatherBonus.toFixed(1)}`,
      `Random jitter: ${b.jitter.toFixed(1)}`,
      `Total score: ${b.total.toFixed(1)}`
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
    const confirm = window.confirm('Are you sure you want to delete this meal? All associated history entries will be removed.');
    if (!confirm) return;
    const [restaurantName, dishName] = key.split('|');
    const toDelete = meals.filter(m => (m.restaurant ?? '—') === restaurantName && m.dish === dishName);
    for (const m of toDelete) {
      try { await FoodChooserAPI.deleteMeal(m.id); } catch (e) { console.error('Failed delete', e); setError('Failed to delete one or more entries'); }
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
        const created = await FoodChooserAPI.addMeal(newData);
        setMeals(prev => [created, ...prev].sort((a,b)=> +new Date(b.date) - +new Date(a.date)));
        setEditMeal(null);
        setEditOriginal(null);
      } else {
        // Update in place
        const updated = await FoodChooserAPI.updateMeal(editMeal.id, {
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
      const confirm = window.confirm('Are you sure you want to delete this entry? This will remove it from your dinner history.');
      if (!confirm) return;
      await FoodChooserAPI.deleteMeal(id);
      setMeals(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Delete failed', e);
      setError('Failed to delete entry');
    }
  }

  async function deleteGroceryHistory(id: string) {
    try {
      const confirm = window.confirm('Are you sure you want to delete this grocery entry?');
      if (!confirm) return;
      await FoodChooserAPI.deleteGrocery(id);
      setGroceries(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      console.error('Delete grocery failed', e);
      setError('Failed to delete grocery entry');
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

  async function toggleDisabledKey(normKey: string) {
    const [r, d] = normKey.split('|');
    const next = !coolOff[normKey];
    // optimistic update
    setCoolOff(prev => ({ ...prev, [normKey]: next }));
    setCoolSavingKey(normKey);
    try {
      await FoodChooserAPI.setDisabledItem(r, d, next);
      // re-fetch from Supabase to ensure persistence
      const latest = await FoodChooserAPI.getDisabledItems();
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
        await FoodChooserAPI.setDisabledItem(r, d, disabled);
      }
      const latest = await FoodChooserAPI.getDisabledItems();
      setCoolOff(latest);
    } finally {
      setCuisineBatchSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-center h-64"><div className="text-lg">Loading your food data...</div></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div className="card p-8 text-center">
          <div className="text-red-600 mb-4">Error: {error}</div>
          <button className="btn-primary" onClick={() => { setError(null); loadData(); }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-zinc-900 transition-colors duration-300 dark:text-zinc-100 md:p-8">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            {/* Project icon if present */}
            <img src="/logo.png" alt="FuDi" className="h-9 w-9 rounded object-cover" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'; }} />
            <Sparkles className="h-6 w-6" />
            <h1 className="text-2xl font-bold md:text-3xl">FuDi</h1>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Smart, fun meal picker — personalized by mood, budget, and weather.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost flex items-center gap-2"
            onClick={toggleTheme}
            aria-label={'Switch to ' + (isDarkTheme ? 'light' : 'dark') + ' theme'}
            title={'Switch to ' + (isDarkTheme ? 'light' : 'dark') + ' theme'}
          >
            {isDarkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="text-xs font-medium">{isDarkTheme ? 'Light' : 'Dark'}</span>
          </button>
          <button className={`btn-ghost ${activeTab==='home'?'border border-zinc-300 dark:border-zinc-700':''}`} onClick={()=> setActiveTab('home')}>Home</button>
          <button className={`btn-ghost ${activeTab==='browse'?'border border-zinc-300 dark:border-zinc-700':''}`} onClick={()=> setActiveTab('browse')}>Browse</button>
          <button className={`btn-ghost ${activeTab==='contributions'?'border border-zinc-300 dark:border-zinc-700':''}`} onClick={()=> setActiveTab('contributions')}>Contributions</button>
          <button className={`btn-ghost ${activeTab==='how'?'border border-zinc-300 dark:border-zinc-700':''}`} onClick={()=> setActiveTab('how')}>How It Works</button>
          <button className="btn-primary" onClick={crackEgg}><Egg className="h-4 w-4"/> Crack Mystery Egg</button>
        </div>
      </header>

      {activeTab==='contributions' ? (
        <div className="space-y-6">
          {/* Contributions Tab Content */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold">💰 Spending Contributions</div>
                <div className="text-xs text-zinc-600 mt-1">See who's been buying meals and groceries</div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className={`btn-ghost text-xs ${contributionsDateRange === 'mtd' ? 'border border-zinc-300' : ''}`}
                  onClick={() => setContributionsDateRange('mtd')}
                >
                  Month to Date
                </button>
                <button 
                  className={`btn-ghost text-xs ${contributionsDateRange === 'all' ? 'border border-zinc-300' : ''}`}
                  onClick={() => setContributionsDateRange('all')}
                >
                  All Time
                </button>
                <button 
                  className={`btn-ghost text-xs ${contributionsDateRange === 'custom' ? 'border border-zinc-300' : ''}`}
                  onClick={() => setContributionsDateRange('custom')}
                >
                  Custom
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
            </div>

            {(() => {
              // Calculate cutoff date based on selected range
              let cutoffDate: Date;
              let dateLabel: string;
              
              if (contributionsDateRange === 'mtd') {
                // Month to date - start of current month
                const now = new Date();
                cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
                dateLabel = `Month to Date (${cutoffDate.toLocaleDateString()})`;
              } else if (contributionsDateRange === 'all') {
                // All time - use a very old date to include everything
                cutoffDate = new Date(2020, 0, 1);
                dateLabel = 'All Time';
              } else {
                // Custom days
                const days = Math.max(1, parseInt(customDays) || 30);
                cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                dateLabel = `Past ${days} day${days === 1 ? '' : 's'}`;
              }

              const recentMeals = meals.filter(m => new Date(m.date) >= cutoffDate && !isSeedMeal(m));
              const recentGroceries = groceries.filter(g => new Date(g.date) >= cutoffDate);

              // Calculate spending by person
              const spendingByPerson: Record<string, { meals: number, groceries: number, total: number }> = {};
              
              // Process meals
              recentMeals.forEach(m => {
                const person = m.purchaser_name || 'Unknown';
                if (!spendingByPerson[person]) {
                  spendingByPerson[person] = { meals: 0, groceries: 0, total: 0 };
                }
                spendingByPerson[person].meals += m.cost;
                spendingByPerson[person].total += m.cost;
              });

              // Process groceries
              recentGroceries.forEach(g => {
                const person = g.purchaser_name || 'Unknown';
                if (!spendingByPerson[person]) {
                  spendingByPerson[person] = { meals: 0, groceries: 0, total: 0 };
                }
                spendingByPerson[person].groceries += g.amount;
                spendingByPerson[person].total += g.amount;
              });

              const people = Object.keys(spendingByPerson);
              const totalSpending = Object.values(spendingByPerson).reduce((sum, p) => sum + p.total, 0);

              const getPersonColor = (person: string) => {
                switch (person) {
                  case 'Ryan': return { bg: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-800' };
                  case 'Rachel': return { bg: 'bg-purple-500', light: 'bg-purple-100', text: 'text-purple-800' };
                  default: return { bg: 'bg-gray-500', light: 'bg-gray-100', text: 'text-gray-600' };
                }
              };

              if (people.length === 0) {
                return (
                  <div className="text-center py-8 text-zinc-600">
                    <div className="text-lg mb-2">No spending data found</div>
                    <div className="text-sm">Try selecting a longer time period or add some meals/groceries with purchaser names</div>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {/* Date Range Label */}
                  <div className="text-center">
                    <div className="inline-block px-3 py-1 bg-blue-50 text-blue-800 rounded-full text-sm font-medium">
                      📅 {dateLabel}
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-semibold text-orange-800">🍽️ Meals</div>
                      <div className="text-2xl font-bold text-orange-600">
                        ${Object.values(spendingByPerson).reduce((sum, p) => sum + p.meals, 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-zinc-600">{recentMeals.length} transactions</div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-semibold text-green-800">🛒 Groceries</div>
                      <div className="text-2xl font-bold text-green-600">
                        ${Object.values(spendingByPerson).reduce((sum, p) => sum + p.groceries, 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-zinc-600">{recentGroceries.length} transactions</div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-semibold text-blue-800">💳 Total</div>
                      <div className="text-2xl font-bold text-blue-600">
                        ${totalSpending.toFixed(2)}
                      </div>
                      <div className="text-xs text-zinc-600">{recentMeals.length + recentGroceries.length} transactions</div>
                    </div>
                  </div>

                  {/* Horizontal Bar Charts */}
                  <div className="space-y-6">
                    {/* Meals Chart */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-orange-800">🍽️ Meal Spending by Person</h3>
                      <div className="space-y-3">
                        {people.sort((a, b) => spendingByPerson[b].meals - spendingByPerson[a].meals).map(person => {
                          const amount = spendingByPerson[person].meals;
                          const maxAmount = Math.max(...Object.values(spendingByPerson).map(p => p.meals));
                          const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                          const colors = getPersonColor(person);
                          
                          return (
                            <div key={`meals-${person}`} className="flex items-center gap-3">
                              <div className="w-20 text-sm font-medium">{person}</div>
                              <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                                <div 
                                  className={`${colors.bg} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                                  style={{ width: `${percentage}%` }}
                                >
                                  <span className="text-white text-xs font-medium">
                                    ${amount.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Groceries Chart */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-green-800">🛒 Grocery Spending by Person</h3>
                      <div className="space-y-3">
                        {people.sort((a, b) => spendingByPerson[b].groceries - spendingByPerson[a].groceries).map(person => {
                          const amount = spendingByPerson[person].groceries;
                          const maxAmount = Math.max(...Object.values(spendingByPerson).map(p => p.groceries));
                          const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                          const colors = getPersonColor(person);
                          
                          return (
                            <div key={`groceries-${person}`} className="flex items-center gap-3">
                              <div className="w-20 text-sm font-medium">{person}</div>
                              <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                                <div 
                                  className={`${colors.bg} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                                  style={{ width: `${percentage}%` }}
                                >
                                  <span className="text-white text-xs font-medium">
                                    ${amount.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Total Chart */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-blue-800">💳 Total Spending by Person</h3>
                      <div className="space-y-3">
                        {people.sort((a, b) => spendingByPerson[b].total - spendingByPerson[a].total).map(person => {
                          const amount = spendingByPerson[person].total;
                          const percentage = totalSpending > 0 ? (amount / totalSpending) * 100 : 0;
                          const colors = getPersonColor(person);
                          
                          return (
                            <div key={`total-${person}`} className="flex items-center gap-3">
                              <div className="w-20 text-sm font-medium">{person}</div>
                              <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                                <div 
                                  className={`${colors.bg} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                                  style={{ width: `${percentage}%` }}
                                >
                                  <span className="text-white text-xs font-medium">
                                    ${amount.toFixed(2)} ({percentage.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : activeTab==='browse' ? (
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2">Browse Meals</div>
          <div className="mt-1 flex items-center gap-2">
            <input className="input" placeholder="Search dish, restaurant, cuisine" value={browseSearch} onChange={e=> setBrowseSearch(e.target.value)} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {/* Side Filters */}
            <div className="rounded-xl border p-4 text-sm">
              <div className="mb-2 font-semibold">Filter by cuisine</div>
              <div className="mb-1 text-xs text-zinc-600">Show only selected cuisines</div>
              <div className="max-h-40 overflow-auto pr-1">
                {Array.from(new Set(meals.map(m => m.cuisine.trim()))).sort().map(c => {
                  const key = normalizeCuisine(c);
                  const on = cuisineFilter[key] !== false;
                  return (
                    <label key={c} className="mb-1 flex items-center justify-between gap-2">
                      <span>{c}</span>
                      <input type="checkbox" checked={on} onChange={e=> setCuisineFilter(prev => ({ ...prev, [key]: e.target.checked }))} />
                    </label>
                  );
                })}
              </div>
            </div>
            {/* Items */}
            <div className="md:col-span-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {browseEntries.filter(e => {
                const key = normalizeCuisine(e.latest.cuisine ?? '');
                const on = cuisineFilter[key] !== false; return on;
              }).map((e) => {
              const normKey = e.key; // already normalized
              const isOff = !!coolOff[normKey];
              return (
              <div key={e.key} className={`card p-5 hover:shadow transition ${isOff ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{displayTitle(e.latest.dish)}</div>
                  <span className="badge">{e.latest.rating ?? '—'}★</span>
                </div>
                <div className="text-sm text-zinc-600">{displayTitle(e.latest.restaurant)} • {displayTitle(e.latest.cuisine, '—')}</div>
                <div className="text-sm text-zinc-600">Latest: {currency(e.latest.cost)} • {new Date(e.latest.date).toISOString().slice(0,10)}</div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button className="btn-primary" onClick={()=> selectBrowseEntry(e.key)}>Select</button>
                  <button
                    className={`inline-flex items-center rounded-xl border px-3 py-2 text-sm ${isOff ? 'border-zinc-300 text-zinc-600 bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    onClick={()=> toggleDisabledKey(normKey)}
                    title={isOff ? 'Enable: allow this dish to be recommended again' : 'Disable: prevent this dish from being recommended until re-enabled'}
                    disabled={coolSavingKey === normKey}
                  >
                    {coolSavingKey === normKey ? 'Saving…' : (isOff ? 'Enable' : 'Disable')}
                  </button>
                </div>
              </div>
            );})}
            </div>
          </div>
        </div>
      ) : activeTab==='home' ? (
        <>
      {/* Controls */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="text-sm font-semibold mb-1">Meal budget</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="label">Min</div>
                  <input className="input" type="number" value={budgetDraft.min} onChange={e=> setBudgetDraft(prev=> ({...prev, min: e.target.value}))} />
            </div>
            <div>
              <div className="label">Max</div>
                  <input className="input" type="number" value={budgetDraft.max} onChange={e=> setBudgetDraft(prev=> ({...prev, max: e.target.value}))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="label">Monthly budget</div>
              <input className="input" type="number" placeholder="e.g., 600" value={monthlyBudgetDraft} onChange={e=> setMonthlyBudgetDraft(e.target.value)} />
            </div>
          </div>
              
              <div className="mt-1 text-xs text-zinc-600">Saved: {currency(budgetSaved.min)} – {currency(budgetSaved.max)}</div>
              <div className="mt-3 text-sm font-semibold">Egg tiers</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                {eggEligibility.map(t => (
                  <div key={t.name} className="flex items-start justify-between rounded border px-2 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-zinc-600">{t.rangeLabel}</span>
                      {!t.eligible && t.tip && <span className="mt-1 text-xs text-zinc-600">{t.tip}</span>}
                    </div>
                    <span className={`badge ${t.eligible ? t.badge : 'border-zinc-300 text-zinc-500'}`}>{t.eligible ? 'Eligible' : 'Not eligible'}</span>
                  </div>
                ))}
              </div>
          <div className="mt-3 text-sm">No repeat within (days)</div>
              <select className="select mt-1" value={forbidRepeatDaysDraft} onChange={e=> setForbidRepeatDaysDraft(e.target.value)}>
                {Array.from({length: 15}, (_,i)=> i).map(n=> <option key={n} value={String(n)}>{n===0 ? '0 (allow repeats)' : n}</option>)}
          </select>
              {prefsError && <div className="mt-2 text-sm text-red-600">{prefsError}</div>}
              {prefsSavedNotice && <div className="mt-2 text-sm text-green-700">{prefsSavedNotice}</div>}
              { (isPrefsDirty || prefsSaving) && (
                <div className="mt-3 flex justify-end">
                  <button className="btn-primary" onClick={savePreferences} disabled={prefsSaving || !isPrefsDirty}>{prefsSaving ? 'Saving…' : 'Save Preferences'}</button>
                </div>
              )}
        </div>

        <div className="card p-5">
              <div className="text-sm font-semibold mb-1">Today's Context</div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="label">Condition</div>
                  <div className="text-lg font-semibold capitalize flex items-center gap-1">{weatherIcon(wx.condition)} <span>{wx.condition}</span></div>
                  <div className="text-xs text-zinc-600">{locationName || 'Location unavailable'}</div>
            </div>
                <div><div className="label">Temp</div><div className="text-lg font-semibold">{wx.tempF}°F</div></div>
            <div>
              <div className="label">Month-to-date Spend</div>
                  <button className="text-left text-lg font-semibold underline decoration-dotted" onClick={()=> { setSpendSelection(monthKey(new Date())); setSpendOpen(true); }}>{currency(totalSpendCurrentMonth)}</button>
            </div>
          </div>
          <div className="mt-4 h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" hide /><YAxis hide /><Tooltip /><Line type="monotone" dataKey="spend" strokeWidth={2} dot={false} /></LineChart>
            </ResponsiveContainer>
          </div>
              {/* Monthly budget summary placed below chart for more space */}
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div className="label font-semibold">Monthly budget</div>
                </div>
                {monthlyBudgetSaved !== null && monthlyBudgetSaved > 0 && (
                  (()=>{
                    const spentMeals = totalSpendMonth();
                    const spentGroceries = totalGroceryMonth();
                    const spent = spentMeals + spentGroceries;
                    const remaining = Math.max(0, monthlyBudgetSaved - spent);
                    const pct = Math.min(100, Math.round((spent / monthlyBudgetSaved) * 100));
                    const bar = budgetBarColor(pct);
                    return (
                      <div className="mt-3">
                        <div className="grid gap-3 sm:grid-cols-3 text-xs">
                          <div className="rounded border p-3"><div className="text-zinc-600">Total</div><div className="text-base font-semibold">{currency(monthlyBudgetSaved)}</div></div>
                          <div className="rounded border p-3"><div className="text-zinc-600">Spent MTD</div><div className="text-base font-semibold">{currency(spent)}</div><div className="mt-1 text-[11px] text-zinc-600">Meals: {currency(spentMeals)} • Groceries: {currency(spentGroceries)}</div></div>
                          <div className="rounded border p-3"><div className="text-zinc-600">Remaining</div><div className={`text-base font-semibold ${spent>monthlyBudgetSaved ? 'text-red-600' : 'text-emerald-700'}`}>{currency(Math.max(0, remaining))}</div></div>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-zinc-600">
                            <span>Usage</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded bg-zinc-200 relative overflow-hidden">
                            <div className={`h-2 absolute left-0 top-0 bg-emerald-500`} style={{ width: `${Math.min(100, Math.round((spentMeals / monthlyBudgetSaved) * 100))}%` }} />
                            <div className={`h-2 absolute left-0 top-0 bg-blue-500`} style={{ width: `${Math.min(100, Math.round(((spentMeals + spentGroceries) / monthlyBudgetSaved) * 100))}%`, opacity: 0.6 }} />
                          </div>
                          <div className="mt-1 flex justify-end gap-3 text-[11px] text-zinc-600"><span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 bg-emerald-500"></span> Meals</span><span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 bg-blue-500 opacity-60"></span> Groceries</span></div>
                        </div>
                      </div>
                    );
                  })()
                )}
          </div>
        </div>

        {/* Quick Filters removed as redundant with Browse */}
      </div>

          

          {/* Reveal Choices (Order Section) */}
        <div className="card p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Top choices for you</div>
              <div className="flex items-center gap-2"><button className="btn-ghost inline-flex items-center gap-1" onClick={openScoreHelp}><Info className="h-4 w-4"/> Explain</button><button className="btn-ghost" onClick={()=> { const next = !orderOpen; setOrderOpen(next); if (next) computeAppPick(); }}>{orderOpen ? 'Hide' : 'Reveal Choices'}</button></div>
          </div>
            <div className="mt-1 text-xs text-zinc-600">Note: The app randomly selects among these top options proportional to their scores. The highlighted one is what the mystery egg will reveal.</div>
            {orderOpen && (
              <div className="mt-3 space-y-2">
                {rankedMeals.slice(0,5).map((s, idx) => {
                  const isChosen = appPickIdx === idx;
                  return (
                    <div
                      key={s.meal.id}
                      className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                        isChosen
                          ? 'bg-amber-50 border-amber-300 dark:bg-amber-300/15 dark:border-amber-200/40'
                          : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          {isChosen && (
                            <span className="badge border-amber-300 bg-amber-200/60 text-amber-900 dark:border-amber-200/60 dark:bg-amber-300/20 dark:text-amber-100">
                              Chosen
                            </span>
                          )}
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {displayTitle(s.meal.dish)}{' '}
                            <span className="text-zinc-500 dark:text-zinc-300">• {displayTitle(s.meal.cuisine, '—')}</span>
                          </div>
                        </div>
                        <div className="text-xs text-zinc-600 dark:text-zinc-300">
                          {displayTitle(s.meal.restaurant)} • {currency(s.meal.cost)} • {s.meal.rating ?? '—'}★
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={()=> selectFromTopChoice(s.meal)}>Select</button>
                      </div>
                    </div>
                  );
                })}
        </div>
            )}
      </div>

          {/* Log Entry (Meal | Grocery Trip) */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Log</div>
          <div className="flex gap-2">
            <button className={`btn-ghost ${logTab==='meal'?'border border-zinc-300':''}`} onClick={()=> setLogTab('meal')}>Meal</button>
            <button className={`btn-ghost ${logTab==='grocery'?'border border-zinc-300':''}`} onClick={()=> setLogTab('grocery')}>Grocery Trip</button>
          </div>
        </div>
        {logTab==='meal' ? (
          <>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="label">Date</div>
            <input className="input" type="date" value={date} onChange={e=> setDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Cost (USD)</div>
            <input className="input" type="number" value={cost} onChange={e=> setCost(e.target.value)} />
          </div>
          <div>
            <div className="label">Cuisine</div>
            <input className="input" list="cuisine-list" value={cuisineInput} onChange={e=> setCuisineInput(e.target.value)} />
            <datalist id="cuisine-list">
              {['Mexican','Japanese','Italian','American','Thai','Indian','Ramen','Pho','Curry','Salad', ...cuisines].filter((v,i,a)=> a.indexOf(v)===i).map(c=> <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <div className="label">Restaurant</div>
                <input className="input" list="restaurant-list" value={restaurant} onChange={e=> setRestaurant(e.target.value)} placeholder="e.g., Chipotle" />
                <datalist id="restaurant-list">{restaurantOptions.map(r => <option key={r} value={r} />)}</datalist>
          </div>
          <div>
            <div className="label">Dish</div>
                <input className="input" list="dish-list" value={dish} onChange={e=> setDish(e.target.value)} placeholder="e.g., Burrito Bowl" />
                <datalist id="dish-list">{dishOptions.map(d => <option key={d} value={d} />)}</datalist>
          </div>
          <div>
            <div className="label">Rating (1-5)</div>
            <input className="input" type="number" min={1} max={5} value={rating} onChange={e=> setRating(Math.max(1, Math.min(5, Number(e.target.value)||1)))} />
          </div>
          <div>
            <div className="label">Who Paid?</div>
            <input className="input" value={purchaserName} onChange={e=> setPurchaserName(e.target.value)} placeholder="e.g., Ryan, Rachel" />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <div className="label">Notes</div>
            <textarea className="input" rows={2} value={notes} onChange={e=> setNotes(e.target.value)} placeholder="Any context, cravings, mood…" />
          </div>
              <label className="md:col-span-2 lg:col-span-3 mt-1 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={seedFlag} onChange={e=> setSeedFlag(e.target.checked)} />
                Mark as seed (won't count toward spend)
              </label>
        </div>
            <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={submitMeal}>Save Meal</button></div>
          </>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <div className="label">Date</div>
                <input className="input" type="date" value={gDate} onChange={e=> setGDate(e.target.value)} />
        </div>
              <div>
                <div className="label">Amount (USD)</div>
                <input className="input" type="number" value={gAmount} onChange={e=> setGAmount(e.target.value)} />
      </div>
              <div>
                <div className="label">Who Paid?</div>
                <input className="input" value={purchaserName} onChange={e=> setPurchaserName(e.target.value)} placeholder="e.g., Ryan, Rachel" />
              </div>
              <div className="relative">
                <div className="label">Store</div>
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
            <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={async ()=>{
              const amt = Number(gAmount) || 0;
              if (amt <= 0) { showToast('Enter a valid amount'); return; }
              await FoodChooserAPI.addGrocery({ 
                date: toLocalISOString(gDate), 
                amount: amt, 
                notes: gStore || null,
                purchaser_name: purchaserName.trim() || 'Unknown'
              });
              const latest = await FoodChooserAPI.getGroceries();
              setGroceries(latest);
              setGDate(todayISO()); setGAmount('50'); setGStore(''); setPurchaserName('');
              showToast('Grocery trip saved');
            }}>Save Trip</button></div>
          </>
        )}
        {/* Shared History section */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">History</div>
            <button className="btn-ghost" onClick={()=> setShowAllHistory(v=>!v)}>{showAllHistory ? 'View Last 5' : 'View All'}</button>
      </div>
        <div className="overflow-x-auto">
            {logTab==='meal' ? (
          <table className="table">
            <thead>
              <tr className="bg-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                <th className="th text-left">Date</th>
                <th className="th text-left">Cuisine</th>
                <th className="th text-left">Restaurant</th>
                <th className="th text-left">Dish</th>
                <th className="th text-right">Cost</th>
                <th className="th text-center">Who Paid?</th>
                <th className="th text-center">Rating</th>
                <th className="th text-center">Actions</th>
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
                        <button className="btn-ghost" onClick={()=> startEdit(m)}>Edit</button>
                        <button className="btn-ghost" onClick={()=> deleteHistory(m.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            ) : (
              <table className="table">
                <thead>
                  <tr className="bg-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                    <th className="th text-left">Date</th>
                    <th className="th text-left">Store</th>
                    <th className="th text-right">Amount</th>
                    <th className="th text-center">Who Paid?</th>
                    <th className="th text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllHistory ? groceries : groceries.slice(0,5)).map(g => (
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
                        <button className="btn-ghost" onClick={()=> deleteGroceryHistory(g.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations removed per request to simplify Home */}

      {/* Scoring explain modal */}
      {scoreHelpOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setScoreHelpOpen(false)}>
          <div className="w-full max-w-lg card p-5 shadow-2xl dark:shadow-lg" onClick={e=> e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold"><Info className="h-5 w-5"/> How we ranked your top choice</div>
            <pre className="whitespace-pre-wrap rounded bg-zinc-100 p-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">{scoreHelpText}</pre>
            <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={()=> setScoreHelpOpen(false)}>Close</button></div>
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
        for (const mm of windowMonths) { monthMapMeals.set(mm, 0); monthMapGroceries.set(mm, 0); }
        for (const meal of meals) {
          const k = getLocalMonthKey(meal.date.slice(0,10));
          if (windowMonths.includes(k) && !isSeedMeal(meal)) monthMapMeals.set(k, (monthMapMeals.get(k) ?? 0) + meal.cost);
        }
        for (const g of groceries) {
          const k = getLocalMonthKey(g.date.slice(0,10));
          if (windowMonths.includes(k)) monthMapGroceries.set(k, (monthMapGroceries.get(k) ?? 0) + g.amount);
        }
        const monthData = windowMonths.map(k => ({
          month: k,
          meals: Math.round((monthMapMeals.get(k) ?? 0)*100)/100,
          groceries: Math.round((monthMapGroceries.get(k) ?? 0)*100)/100,
        }));
        const totalMealsWindow = monthData.reduce((s, d) => s + d.meals, 0);
        const totalGroceriesWindow = monthData.reduce((s, d) => s + d.groceries, 0);
        const totalWindow = Math.round((totalMealsWindow + totalGroceriesWindow) * 100) / 100;
        const selectedMonth = windowMonths.includes(spendSelection || '') ? (spendSelection as string) : windowMonths[5];
        const contributingMeals = meals.filter(m => getLocalMonthKey(m.date.slice(0,10))===selectedMonth && !isSeedMeal(m));
        const contributingGroceries = groceries.filter(g => getLocalMonthKey(g.date.slice(0,10))===selectedMonth);
        return (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setSpendOpen(false)}>
            <div className="w-full max-w-3xl card p-5 shadow-2xl dark:shadow-lg" onClick={e=> e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">Spend</div>
                <div className="flex gap-2">
                  <button className="btn-ghost" title="Previous 6 months" onClick={()=> {
                    // move window back by 1 month
                    const [yy, mm] = spendWindowStart.split('-').map(Number);
                    const prev = new Date((yy||1970), (mm||1)-2, 1);
                    setSpendWindowStart(`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`);
                    setSpendSelection(null);
                  }}>◀ 6mo</button>
                  <div className="rounded border px-2 py-1 text-sm dark:border-zinc-700" title="Currently viewing a 6-month window">{windowMonths[0]} — {windowMonths[5]}</div>
                  <button className="btn-ghost" title="Next 6 months" onClick={()=> {
                    // move window forward by 1 month
                    const [yy, mm] = spendWindowStart.split('-').map(Number);
                    const next = new Date((yy||1970), (mm||1), 1);
                    setSpendWindowStart(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`);
                    setSpendSelection(null);
                  }}>6mo ▶</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="h-[220px] rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthData} onClick={(e:any)=> { if (e && e.activeLabel) setSpendSelection(e.activeLabel); }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#3f3f46' : '#e4e4e7'} opacity={0.7} />
                          <XAxis dataKey="month" stroke={theme === 'dark' ? '#d4d4d8' : '#3f3f46'} tick={{ fill: theme === 'dark' ? '#d4d4d8' : '#3f3f46' }} />
                          <YAxis stroke={theme === 'dark' ? '#d4d4d8' : '#3f3f46'} tick={{ fill: theme === 'dark' ? '#d4d4d8' : '#3f3f46' }} />
                          <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', color: theme === 'dark' ? '#e4e4e7' : '#0f172a', border: '1px solid', borderColor: theme === 'dark' ? '#3f3f46' : '#e5e7eb' }} labelStyle={{ color: theme === 'dark' ? '#e4e4e7' : '#0f172a' }} />
                          <Bar dataKey="meals" stackId="a" fill="#10b981" />
                          <Bar dataKey="groceries" stackId="a" fill="#3b82f6" fillOpacity={0.7} />
                        </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
                    <div className="rounded border p-3 dark:border-zinc-700 dark:bg-zinc-900"><div className="text-zinc-600 dark:text-zinc-300">Total (6 mo)</div><div className="text-base font-semibold">{currency(totalWindow)}</div></div>
                    <div className="rounded border p-3 dark:border-zinc-700 dark:bg-zinc-900"><div className="text-zinc-600 dark:text-zinc-300">Groceries</div><div className="text-base font-semibold">{currency(Math.round(totalGroceriesWindow*100)/100)}</div></div>
                    <div className="rounded border p-3 dark:border-zinc-700 dark:bg-zinc-900"><div className="text-zinc-600 dark:text-zinc-300">Meals</div><div className="text-base font-semibold">{currency(Math.round(totalMealsWindow*100)/100)}</div></div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">{selectedMonth}</div>
                  </div>
                  <div className="max-h-[220px] overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                    {contributingGroceries.concat([]).sort((a,b)=> +new Date(b.date) - +new Date(a.date)).map(g => (
                      <div key={`g-${g.id}`} className="flex items-center justify-between border-b py-2 text-sm last:border-b-0 dark:border-zinc-700">
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">Grocery</div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-300">{g.notes ?? '—'} • {g.date.slice(0,10)}</div>
                        </div>
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{currency(g.amount)}</div>
                      </div>
                    ))}
                    {contributingMeals.concat([]).sort((a,b)=> +new Date(b.date) - +new Date(a.date)).map(m => (
                      <div key={`m-${m.id}`} className="flex items-center justify-between border-b py-2 text-sm last:border-b-0 dark:border-zinc-700">
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">{displayTitle(m.dish)} <span className="text-zinc-500 dark:text-zinc-300">• {displayTitle(m.cuisine, '—')}</span></div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-300">{displayTitle(m.restaurant)} • {m.date.slice(0,10)}</div>
                        </div>
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{currency(m.cost)}</div>
                      </div>
                    ))}
                    {contributingMeals.length===0 && contributingGroceries.length===0 && <div className="p-3 text-sm text-zinc-600 dark:text-zinc-300">No spend in this month.</div>}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={()=> setSpendOpen(false)}>Close</button></div>
            </div>
          </div>
        );
      })()}

      </>
      ) : (
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2">How the ranking works</div>
          <div className="space-y-3 text-sm">
            <div>
              The score for each meal uses this formula:
              <ul className="ml-5 list-disc">
                <li>Rating weight: (rating or 3) × 10</li>
                <li>Recency penalty: up to −12 for very recent meals</li>
                <li>Budget fit: +8 if within your saved budget; negative if outside</li>
                <li>Weather bonus: +2 to +3 for cuisines matching today's weather</li>
                <li>Random jitter: small ±1.5 to add variety</li>
              </ul>
            </div>
            <div className="rounded border p-3">
              <div className="font-semibold mb-1">Today's context</div>
              <div>Weather: {wx.condition} • {wx.tempF}°F • Budget: {currency(budgetSaved.min)} – {currency(budgetSaved.max)}</div>
            </div>
            <div>
              <div className="font-semibold mb-1">Examples</div>
              <div className="grid gap-2 md:grid-cols-2">
                {rankedMeals.slice(0,2).map(s => (
                  <div key={s.meal.id} className="rounded border p-3">
                    <div className="font-medium">{displayTitle(s.meal.dish)} • {displayTitle(s.meal.cuisine,'—')}</div>
                    <div className="text-xs text-zinc-600 mb-2">{displayTitle(s.meal.restaurant)} • {currency(s.meal.cost)}</div>
                    <ul className="ml-5 list-disc text-xs">
                      <li>Rating weight: {Math.round((s.breakdown.ratingWeight)*10)/10}</li>
                      <li>Recency penalty: {Math.round((s.breakdown.recencyPenalty)*10)/10}</li>
                      <li>Budget fit: {Math.round((s.breakdown.budgetFit)*10)/10}</li>
                      <li>Weather bonus: {Math.round((s.breakdown.weatherBonus)*10)/10}</li>
                      <li>Jitter: {Math.round((s.breakdown.jitter)*10)/10}</li>
                    </ul>
                    <div className="mt-1 text-xs">Total score: <span className="font-semibold">{Math.round((s.breakdown.total)*10)/10}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <EggGacha open={eggOpen} pick={picked} onClose={() => setEggOpen(false)} onOrder={handleOrder} confirmLabel={isOverride ? "Choose & Save" : "Save to Meal History"} />

      
      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 transform">
          <div className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
            {toast.message}
          </div>
        </div>
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
