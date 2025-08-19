import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Egg, Filter, History, Info, Sparkles, Trash2 } from 'lucide-react';
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
  { date: new Date(Date.now()-86400000*6).toISOString(), cuisine:'Mexican', dish:'Chipotle Bowl', restaurant:'Chipotle', cost:14.5, rating:4, notes: null, seed_only: false },
  { date: new Date(Date.now()-86400000*5).toISOString(), cuisine:'Japanese', dish:'Salmon Poke', restaurant:'Poke House', cost:19.2, rating:5, notes: null, seed_only: false },
  { date: new Date(Date.now()-86400000*3).toISOString(), cuisine:'Italian', dish:'Margherita Pizza', restaurant:"Tony's", cost:24.0, rating:4, notes: null, seed_only: false },
  { date: new Date(Date.now()-86400000*2).toISOString(), cuisine:'American', dish:'Smash Burger', restaurant:'Burger Bros', cost:16.0, rating:3, notes: null, seed_only: false },
  { date: new Date(Date.now()-86400000*1).toISOString(), cuisine:'Thai', dish:'Pad See Ew', restaurant:'Thai Basil', cost:18.5, rating:5, notes: null, seed_only: false },
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

  // Tabs: Home (default) and Browse (right)
  const [activeTab, setActiveTab] = useState<'home'|'browse'|'how'>('home');
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
  const [spendMode, setSpendMode] = useState<'daily'|'monthly'>('daily');
  const [spendSelection, setSpendSelection] = useState<string | null>(null); // ISO day or YYYY-MM
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
      const [mealsData, prefsData, overridesData] = await Promise.all([
        FoodChooserAPI.getMeals(),
        FoodChooserAPI.getUserPreferences(),
        FoodChooserAPI.getOverridesMap()
      ]);
      setMeals(mealsData);
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
    return meals
      .filter(m=> !isSeedMeal(m))
      .filter(m=> monthKey(new Date(m.date))===nowKey)
      .reduce((s,m)=> s+m.cost, 0);
  }, [meals]);
  function totalSpendMonth(){
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return meals
      .filter(m => !isSeedMeal(m))
      .filter(m => {
      const t = new Date(m.date);
      return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}` === ym;
    }).reduce((s,m)=> s+m.cost, 0);
  }
  function budgetBarColor(pct: number){
    if (pct <= 50) return 'bg-emerald-500';
    if (pct <= 80) return 'bg-yellow-500';
    if (pct <= 100) return 'bg-orange-500';
    return 'bg-red-500';
  }
  const chartData = useMemo(()=>{
    const days: {day:string; spend:number}[] = [];
    for (let i=13;i>=0;i--){ const d=new Date(Date.now()-i*86400000); const k=d.toISOString().slice(0,10);
      const spend = meals.filter(m=> !isSeedMeal(m) && m.date.slice(0,10)===k).reduce((s,m)=> s+m.cost, 0);
      days.push({ day:k.slice(5), spend: Math.round(spend*100)/100 });
    }
    return days;
  }, [meals]);

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
      seed_only: false
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
      seed_only: false
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
      date: (date ? new Date(date) : new Date()).toISOString(), 
      restaurant: normalizedRestaurant, 
      dish: normalizedDish, 
      cuisine: normalizedCuisine, 
      cost: Math.max(0, Number(cost) || 0), 
      rating, 
      notes: (seeded ? `${SEED_TAG} ` : '') + (notes || '') || null,
      seed_only: seeded
    };
    await addMeal(mealData);
    setDate(todayISO()); setRestaurant(''); setDish(''); setCuisineInput('Mexican'); setCost('15'); setRating(4); setNotes(''); setSeedFlag(false);
  }

  async function handleOrder(rec: Recommendation) {
    try {
      setError(null);
      const mealData = { date: new Date().toISOString(), restaurant: rec.suggestedRestaurant || null, dish: rec.dish ?? rec.label, cuisine: rec.label, cost: rec.estCost, rating: null, notes: null, seed_only: false };
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
    await addMeal({ date: new Date().toISOString(), restaurant: latest.restaurant, dish: latest.dish, cuisine: latest.cuisine, cost: latest.cost, rating: latest.rating ?? null, notes: latest.notes ?? null, seed_only: false });
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
          seed_only: (editMeal as any).seed_only === true
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
          notes: editMeal.notes ?? null
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
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            {/* Project icon if present */}
            <img src="/logo.png" alt="FuDi" className="h-9 w-9 rounded object-cover" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'; }} />
            <Sparkles className="h-6 w-6" />
            <h1 className="text-2xl font-bold md:text-3xl">FuDi</h1>
          </div>
          <p className="text-sm text-zinc-600">Smart, fun meal picker — personalized by mood, budget, and weather.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`btn-ghost ${activeTab==='home'?'border border-zinc-300':''}`} onClick={()=> setActiveTab('home')}>Home</button>
          <button className={`btn-ghost ${activeTab==='browse'?'border border-zinc-300':''}`} onClick={()=> setActiveTab('browse')}>Browse</button>
          <button className={`btn-ghost ${activeTab==='how'?'border border-zinc-300':''}`} onClick={()=> setActiveTab('how')}>How It Works</button>
          <button className="btn-outline" onClick={seedDemo}><History className="h-4 w-4"/> Load Demo Data</button>
          <button className="btn-primary" onClick={crackEgg}><Egg className="h-4 w-4"/> Crack Mystery Egg</button>
        </div>
      </header>

      {activeTab==='browse' ? (
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
                    className={`inline-flex items-center rounded-xl border px-3 py-2 text-sm ${isOff ? 'border-zinc-300 text-zinc-600 bg-zinc-100' : 'hover:bg-zinc-50'}`}
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
                {Array.from({length: 15}, (_,i)=> i).map(n=> <option key={n} value={String(n)}>{n}</option>)}
          </select>
              {prefsError && <div className="mt-2 text-sm text-red-600">{prefsError}</div>}
              {prefsSavedNotice && <div className="mt-2 text-sm text-green-700">{prefsSavedNotice}</div>}
              <div className="mt-3 flex justify-end">
                <button className="btn-primary" onClick={savePreferences} disabled={prefsSaving || !isPrefsDirty}>{prefsSaving ? 'Saving…' : 'Save Preferences'}</button>
              </div>
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
                  <button className="text-left text-lg font-semibold underline decoration-dotted" onClick={()=> { setSpendMode('monthly'); setSpendSelection(monthKey(new Date())); setSpendOpen(true); }}>{currency(totalSpendCurrentMonth)}</button>
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
                    const spent = totalSpendMonth();
                    const remaining = Math.max(0, monthlyBudgetSaved - spent);
                    const pct = Math.min(100, Math.round((spent / monthlyBudgetSaved) * 100));
                    const bar = budgetBarColor(pct);
                    return (
                      <div className="mt-3">
                        <div className="grid gap-3 sm:grid-cols-3 text-xs">
                          <div className="rounded border p-3"><div className="text-zinc-600">Total</div><div className="text-base font-semibold">{currency(monthlyBudgetSaved)}</div></div>
                          <div className="rounded border p-3"><div className="text-zinc-600">Spent MTD</div><div className="text-base font-semibold">{currency(spent)}</div></div>
                          <div className="rounded border p-3"><div className="text-zinc-600">Remaining</div><div className={`text-base font-semibold ${spent>monthlyBudgetSaved ? 'text-red-600' : 'text-emerald-700'}`}>{currency(Math.max(0, remaining))}</div></div>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-zinc-600">
                            <span>Usage</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded bg-zinc-200">
                            <div className={`h-2 rounded ${bar}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
          </div>
        </div>

        {/* Quick Filters removed as redundant with Browse */}
      </div>

          {/* Log a Meal */}
      <div className="card p-5">
        <div className="text-sm font-semibold mb-3">Log a Meal</div>
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
                {rankedMeals.slice(0,5).map((s, idx) => (
                  <div key={s.meal.id} className={`flex items-center justify-between rounded-lg border p-3 ${appPickIdx===idx ? 'bg-amber-50' : ''}`}>
                    <div>
                      <div className="flex items-center gap-2">{appPickIdx===idx && <span className="badge">Chosen</span>}<div className="font-medium">{displayTitle(s.meal.dish)} <span className="text-zinc-500">• {displayTitle(s.meal.cuisine, '—')}</span></div></div>
                      <div className="text-xs text-zinc-600">{displayTitle(s.meal.restaurant)} • {currency(s.meal.cost)} • {s.meal.rating ?? '—'}★</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={()=> selectFromTopChoice(s.meal)}>Select</button>
                    </div>
                  </div>
                ))}
        </div>
            )}
      </div>

      {/* Recommendations removed per request to simplify Home */}

      {/* Scoring explain modal */}
      {scoreHelpOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setScoreHelpOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={e=> e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold"><Info className="h-5 w-5"/> How we ranked your top choice</div>
            <pre className="whitespace-pre-wrap rounded bg-zinc-50 p-3 text-sm text-zinc-800">{scoreHelpText}</pre>
            <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={()=> setScoreHelpOpen(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* Meal History (Home only) */}
      {activeTab === 'home' && (
      <div className="card p-5">
          <div className="flex items-center justify-between"><div className="text-sm font-semibold">Meal History</div><button className="btn-ghost" onClick={()=> setShowAllHistory(v=>!v)}>{showAllHistory ? 'View Last 5' : 'View All'}</button></div>
        <div className="overflow-x-auto">
          <table className="table">
              <thead><tr className="bg-zinc-50"><th className="th text-left">Date</th><th className="th text-left">Cuisine</th><th className="th text-left">Restaurant</th><th className="th text-left">Dish</th><th className="th text-right">Cost</th><th className="th text-center">Rating</th><th className="th text-center">Actions</th></tr></thead>
            <tbody>
                {(showAllHistory ? meals : meals.slice(0,5)).map(m => (
                <tr key={m.id} className="hover:bg-zinc-50">
                  <td className="td">{m.date.slice(0,10)} {isSeedMeal(m) && <span className="text-amber-700">(seed)</span>}</td>
                    <td className="td">{displayTitle(m.cuisine, '—')}</td>
                    <td className="td">{displayTitle(m.restaurant, '—')}</td>
                    <td className="td">{displayTitle(m.dish)}</td>
                  <td className="td text-right">{currency(m.cost)}</td>
                  <td className="td text-center">{m.rating ?? '—'}</td>
                    <td className="td text-center"><button className="btn-ghost" onClick={()=> startEdit(m)}>Edit</button><button className="btn-ghost" onClick={()=> deleteHistory(m.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Edit history modal */}
      {editMeal && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setEditMeal(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={e=> e.stopPropagation()}>
            <div className="mb-2 text-lg font-semibold">Edit Dinner Entry</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><div className="label">Date</div><input className="input" type="datetime-local" value={new Date(editMeal.date).toISOString().slice(0,16)} onChange={e=> setEditMeal({...editMeal, date: new Date(e.target.value).toISOString()})} /></div>
              <div><div className="label">Cost</div><input className="input" type="number" value={String(editMeal.cost)} onChange={e=> setEditMeal({...editMeal, cost: Number(e.target.value)||0})} /></div>
              <div><div className="label">Cuisine</div><input className="input" value={editMeal.cuisine} onChange={e=> setEditMeal({...editMeal, cuisine: e.target.value})} /></div>
              <div><div className="label">Restaurant</div><input className="input" value={editMeal.restaurant ?? ''} onChange={e=> setEditMeal({...editMeal, restaurant: e.target.value||null})} /></div>
              <div><div className="label">Dish</div><input className="input" value={editMeal.dish} onChange={e=> setEditMeal({...editMeal, dish: e.target.value})} /></div>
              <div><div className="label">Rating</div><input className="input" type="number" min={1} max={5} value={String(editMeal.rating ?? '')} onChange={e=> setEditMeal({...editMeal, rating: e.target.value? Number(e.target.value): null})} /></div>
              <div className="md:col-span-2"><div className="label">Notes</div><textarea className="input" rows={2} value={editMeal.notes ?? ''} onChange={e=> setEditMeal({...editMeal, notes: e.target.value||null})} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={()=> setEditMeal(null)}>Cancel</button><button className="btn-primary" disabled={editSaving} onClick={saveEdit}>{editSaving ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}

      {/* Spend drilldown modal */}
      {spendOpen && (() => {
        // Build daily (last 180 days) and monthly (last 12 months) datasets
        const today = new Date();
        const dayData: { day: string; spend: number }[] = [];
        for (let i=179;i>=0;i--) {
          const d=new Date(today.getTime()-i*86400000); const iso=d.toISOString().slice(0,10);
          const spend = meals.filter(m=> !isSeedMeal(m) && m.date.slice(0,10)===iso).reduce((s,m)=> s+m.cost, 0);
          dayData.push({ day: iso, spend: Math.round(spend*100)/100 });
        }
        const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const monthMap = new Map<string, number>();
        for (const m of meals) {
          const k = monthKey(new Date(m.date));
          monthMap.set(k, (monthMap.get(k) ?? 0) + m.cost);
        }
        const sortedMonths = Array.from(monthMap.entries()).sort(([a],[b])=> a<b? -1:1).slice(-12);
        const monthData = sortedMonths.map(([k,v])=> ({ month: k, spend: Math.round(v*100)/100 }));
        const selectionLabel = spendMode==='daily' ? (spendSelection ?? 'Select a day') : (spendSelection ?? 'Select a month');
        const contributingMeals = spendSelection ? meals.filter(m => !isSeedMeal(m) && (spendMode==='daily' ? m.date.slice(0,10)===spendSelection : monthKey(new Date(m.date))===spendSelection)) : [];
        return (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={()=> setSpendOpen(false)}>
            <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl" onClick={e=> e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">Eating-out Spend</div>
                <div className="flex gap-2">
                  <button className={`btn-ghost ${spendMode==='daily'?'border':''}`} onClick={()=> { setSpendMode('daily'); setSpendSelection(null); }}>Daily</button>
                  <button className={`btn-ghost ${spendMode==='monthly'?'border':''}`} onClick={()=> { setSpendMode('monthly'); setSpendSelection(null); }}>Monthly</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    {spendMode==='daily' ? (
                      <LineChart data={dayData} onClick={(e:any)=> { if (e && e.activeLabel) setSpendSelection(e.activeLabel); }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" tickFormatter={(v)=> v.slice(5)} />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="spend" strokeWidth={2} dot={false} />
                      </LineChart>
                    ) : (
                      <BarChart data={monthData} onClick={(e:any)=> { if (e && e.activeLabel) setSpendSelection(e.activeLabel); }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="spend" />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2">{selectionLabel}</div>
                  <div className="max-h-[220px] overflow-auto">
                    {contributingMeals.length ? contributingMeals.sort((a,b)=> +new Date(b.date) - +new Date(a.date)).map(m => (
                      <div key={m.id} className="flex items-center justify-between border-b py-2 text-sm">
                        <div>
                          <div className="font-medium">{displayTitle(m.dish)} <span className="text-zinc-500">• {displayTitle(m.cuisine, '—')}</span></div>
                          <div className="text-xs text-zinc-600">{displayTitle(m.restaurant)} • {m.date.slice(0,10)}</div>
                        </div>
                        <div className="font-semibold">{currency(m.cost)}</div>
                      </div>
                    )) : <div className="text-sm text-zinc-600">Select a {spendMode==='daily' ? 'day' : 'month'} to see details.</div>}
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

      <footer className="pb-8 pt-2 text-center text-xs text-zinc-500">Built for MVP demo • Data saved to Supabase database</footer>
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