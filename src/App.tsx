import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Egg, Filter, History, Info, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import EggGacha from "./components/EggGacha";
import { FoodChooserAPI } from './lib/api';
import type { Database } from './lib/supabase';

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
function pseudoWeatherForDate(iso:string): Weather {
  const d = new Date(iso); const seed = (d.getMonth()+1)*37 + d.getDate()*17; const tempF = 50 + (seed % 50);
  let condition: Weather['condition'] = 'mild'; if (tempF>=85) condition='hot'; else if (tempF<=58) condition='cold'; if (seed%7===0) condition='rain';
  return { condition, tempF };
}
function deriveTier(cost:number): EggTier { if (cost<15) return 'Bronze'; if (cost<30) return 'Silver'; if (cost<55) return 'Gold'; return 'Diamond'; }

const seedMeals: Omit<Meal, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
  { date: new Date(Date.now()-86400000*6).toISOString(), cuisine:'Mexican', dish:'Chipotle Bowl', restaurant:'Chipotle', cost:14.5, rating:4, notes: null },
  { date: new Date(Date.now()-86400000*5).toISOString(), cuisine:'Japanese', dish:'Salmon Poke', restaurant:'Poke House', cost:19.2, rating:5, notes: null },
  { date: new Date(Date.now()-86400000*3).toISOString(), cuisine:'Italian', dish:'Margherita Pizza', restaurant:"Tony's", cost:24.0, rating:4, notes: null },
  { date: new Date(Date.now()-86400000*2).toISOString(), cuisine:'American', dish:'Smash Burger', restaurant:'Burger Bros', cost:16.0, rating:3, notes: null },
  { date: new Date(Date.now()-86400000*1).toISOString(), cuisine:'Thai', dish:'Pad See Ew', restaurant:'Thai Basil', cost:18.5, rating:5, notes: null },
];

function buildRecommendations(
  meals: Meal[],
  budget: Budget,
  forbidRepeatDays = 1,
  overrides: Overrides = {}
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
    const recencyPenalty = lastDays <= forbidRepeatDays ? -100 : Math.max(-8, -1 * (6 - Math.min(6, lastDays)));
    const within = lastCost >= budget.min && lastCost <= budget.max;
    const budgetFit = within ? 12 : -Math.min(Math.abs(lastCost - (lastCost < budget.min ? budget.min : budget.max))/5, 10);
    const todayWx = pseudoWeatherForDate(todayISO());
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
      estCost: lastCost, // always show latest price
      score,
      tier: deriveTier(lastCost)
    });
  }
  // Always honor budget range for suggestions based on latest price
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
  // quick search on Home
  const [search, setSearch] = useState('');
  const [eggOpen, setEggOpen] = useState(false);
  const [picked, setPicked] = useState<Recommendation | undefined>();
  const [overrides, setOverrides] = useState<Overrides>({});
  const [isOverride, setIsOverride] = useState(false);

  // Tabs: Home (default) and Browse (right)
  const [activeTab, setActiveTab] = useState<'home'|'browse'>('home');
  const [browseSearch, setBrowseSearch] = useState('');
  const [orderOpen, setOrderOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [scoreHelpOpen, setScoreHelpOpen] = useState(false);
  const [scoreHelpText, setScoreHelpText] = useState<string>('');

  // Browse details modal
  const [browseDetailKey, setBrowseDetailKey] = useState<string | null>(null);

  // Edit history modal
  const [editMeal, setEditMeal] = useState<Meal | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Prefs save state
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSavedNotice, setPrefsSavedNotice] = useState<string | null>(null);

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
        // sync drafts to saved
        setBudgetDraft({ min: String(savedBudget.min), max: String(savedBudget.max) });
        setForbidRepeatDaysDraft(String(prefsData.forbid_repeat_days));
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
    if (!isFinite(min) || !isFinite(max)) { setPrefsError('Please enter valid numeric min and max.'); return; }
    if (min < 0 || max < 0) { setPrefsError('Min and Max must be non-negative.'); return; }
    if (max < min) { setPrefsError('Max must be greater than or equal to Min.'); return; }
    if (!Number.isInteger(days) || days < 0 || days > 14) { setPrefsError('No repeat within days must be an integer between 0 and 14.'); return; }
    try {
      setPrefsSaving(true);
      const saved = await FoodChooserAPI.upsertUserPreferences({
        budget_min: min,
        budget_max: max,
        forbid_repeat_days: days,
        strict_budget: true
      });
      setBudgetSaved({ min: saved.budget_min, max: saved.budget_max });
      setForbidRepeatDaysSaved(saved.forbid_repeat_days);
      setPrefsSavedNotice('Preferences saved.');
    } catch (e) {
      console.error('Failed to save preferences', e);
      setPrefsError('Failed to save preferences.');
    } finally {
      setPrefsSaving(false);
    }
  }

  const cuisines = useMemo(()=> [...new Set(meals.map(m=>m.cuisine))], [meals]);
  const wx = pseudoWeatherForDate(todayISO());
  const recs = useMemo(()=> buildRecommendations(meals, budgetSaved, forbidRepeatDaysSaved, overrides), [meals, budgetSaved, forbidRepeatDaysSaved, overrides]);
  const filteredRecs = recs.filter(r=> r.label.toLowerCase().includes(search.toLowerCase()));

  const totalSpend30d = useMemo(()=>{
    const now=Date.now();
    return meals.filter(m=> now - new Date(m.date).getTime() <= 30*86400000).reduce((s,m)=> s+m.cost, 0);
  }, [meals]);
  const chartData = useMemo(()=>{
    const days: {day:string; spend:number}[] = [];
    for (let i=13;i>=0;i--){ const d=new Date(Date.now()-i*86400000); const k=d.toISOString().slice(0,10);
      const spend = meals.filter(m=> m.date.slice(0,10)===k).reduce((s,m)=> s+m.cost, 0);
      days.push({ day:k.slice(5), spend: Math.round(spend*100)/100 });
    }
    return days;
  }, [meals]);

  async function seedDemo(){
    try { setError(null); for (const meal of seedMeals) { await FoodChooserAPI.addMeal(meal); } await loadData(); }
    catch (err) { console.error('Error seeding demo data:', err); setError('Failed to load demo data'); }
  }

  async function addMeal(mealData: Omit<Meal, 'id' | 'user_id' | 'created_at' | 'updated_at'>){
    try { setError(null); const newMeal = await FoodChooserAPI.addMeal(mealData); setMeals(prev => [newMeal, ...prev].sort((a,b)=> +new Date(b.date) - +new Date(a.date))); }
    catch (err) { console.error('Error adding meal:', err); setError('Failed to add meal'); }
  }

  // For Browse: compute deduped entries by (restaurant, dish) with latest date and latest price
  const browseEntries = useMemo(() => {
    const byKey = new Map<string, Meal[]>();
    for (const m of meals) {
      const key = `${m.restaurant ?? '—'}|${m.dish}`;
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

  function crackEgg(){
    setIsOverride(false);
    if (!rankedMeals.length){ setPicked(undefined); setEggOpen(true); return; }
    const top = rankedMeals[0].meal;
    setPicked({ key: top.id, label: top.cuisine, suggestedRestaurant: top.restaurant ?? undefined, dish: top.dish, estCost: top.cost, score: 0, tier: deriveTier(top.cost) });
    setEggOpen(true);
  }

  const [date, setDate] = useState(todayISO());
  const [restaurant, setRestaurant] = useState('');
  const [dish, setDish] = useState('');
  const [cuisineInput, setCuisineInput] = useState('Mexican');
  const [cost, setCost] = useState('15');
  const [rating, setRating] = useState(4);
  const [notes, setNotes] = useState('');

  async function submitMeal(){
    const mealData = { date: new Date(date).toISOString(), restaurant: restaurant || null, dish: dish || "Chef's choice", cuisine: cuisineInput, cost: Math.max(0, Number(cost) || 0), rating, notes: notes || null };
    await addMeal(mealData);
    setDate(todayISO()); setRestaurant(''); setDish(''); setCuisineInput('Mexican'); setCost('15'); setRating(4); setNotes('');
  }

  async function handleOrder(rec: Recommendation) {
    try {
      setError(null);
      const mealData = { date: new Date().toISOString(), restaurant: rec.suggestedRestaurant || null, dish: rec.dish ?? rec.label, cuisine: rec.label, cost: rec.estCost, rating: null, notes: null };
      await addMeal(mealData);
      if (isOverride) { const newCount = (overrides[rec.label] ?? 0) + 1; await FoodChooserAPI.upsertCuisineOverride(rec.label, newCount); }
      setIsOverride(false);
    } catch (err) { console.error('Error handling order:', err); setError('Failed to save meal'); }
  }

  const rankedMeals = useMemo(() => {
    const scored = meals
      .filter(m => m.cost >= budgetSaved.min && m.cost <= budgetSaved.max)
      .map(m => { const b = computeMealScoreBreakdown(m, budgetSaved, wx); return { meal: m, score: b.total, breakdown: b }; });
    const bestByKey = new Map<string, { meal: Meal; score: number; breakdown: ReturnType<typeof computeMealScoreBreakdown> }>();
    for (const s of scored) {
      const key = `${s.meal.restaurant ?? '—'}|${s.meal.dish}`;
      const prev = bestByKey.get(key);
      if (!prev || s.score > prev.score) bestByKey.set(key, s);
    }
    const deduped = Array.from(bestByKey.values());
    deduped.sort((a,b) => (b.score !== a.score) ? (b.score - a.score) : (b.meal.cost - a.meal.cost));
    return deduped;
  }, [meals, budgetSaved, wx]);

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

  // Browse: open detail modal
  function openBrowseDetail(key: string) { setBrowseDetailKey(key); }
  function closeBrowseDetail() { setBrowseDetailKey(null); }

  // Browse: add latest entry to dinner history
  async function addBrowseEntryToHistory(key: string) {
    const entry = browseEntries.find(e => e.key === key);
    if (!entry) return;
    const latest = entry.latest;
    await addMeal({ date: new Date().toISOString(), restaurant: latest.restaurant, dish: latest.dish, cuisine: latest.cuisine, cost: latest.cost, rating: latest.rating ?? null, notes: latest.notes ?? null });
  }

  // History edit helpers
  function startEdit(m: Meal) { setEditMeal(m); }
  async function saveEdit() {
    if (!editMeal) return;
    try {
      setEditSaving(true);
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
    } catch (e) {
      console.error('Save edit failed', e);
      setError('Failed to save edit');
    } finally { setEditSaving(false); }
  }
  async function deleteHistory(id: string) {
    try {
      await FoodChooserAPI.deleteMeal(id);
      setMeals(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Delete failed', e);
      setError('Failed to delete entry');
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
          <div className="flex items-center gap-2"><Sparkles className="h-6 w-6" /><h1 className="text-2xl font-bold md:text-3xl">FuDi</h1></div>
          <p className="text-sm text-zinc-600">Smart, fun dinner picks — personalized by mood, budget, and weather.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`btn-ghost ${activeTab==='home'?'border border-zinc-300':''}`} onClick={()=> setActiveTab('home')}>Home</button>
          <button className={`btn-ghost ${activeTab==='browse'?'border border-zinc-300':''}`} onClick={()=> setActiveTab('browse')}>Browse</button>
          <button className="btn-outline" onClick={seedDemo}><History className="h-4 w-4"/> Load Demo Data</button>
          <button className="btn-primary" onClick={crackEgg}><Egg className="h-4 w-4"/> Crack Mystery Egg</button>
        </div>
      </header>

      {activeTab==='browse' ? (
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2">Browse Meals</div>
          <div className="mt-1 flex items-center gap-2">
            <input className="input" placeholder="Search dish, restaurant, cuisine" value={browseSearch} onChange={e=> setBrowseSearch(e.target.value)} />
            <button className="btn-ghost" onClick={()=> setBrowseSearch('')}><Filter className="h-4 w-4"/></button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {browseEntries.map(e => (
              <div key={e.key} className="card p-5 hover:shadow transition cursor-pointer" onClick={()=> openBrowseDetail(e.key)}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{e.latest.dish}</div>
                  <span className="badge">{e.latest.rating ?? '—'}★</span>
                </div>
                <div className="text-sm text-zinc-600">{e.latest.restaurant ?? 'Unknown'} • {e.latest.cuisine}</div>
                <div className="text-sm text-zinc-600">Latest: {currency(e.latest.cost)} • {new Date(e.latest.date).toISOString().slice(0,10)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card p-5">
              <div className="text-sm font-semibold mb-1">Budget</div>
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
              <div className="mt-3 text-sm">No repeat within (days)</div>
              <select className="select mt-1" value={forbidRepeatDaysDraft} onChange={e=> setForbidRepeatDaysDraft(e.target.value)}>
                {Array.from({length: 15}, (_,i)=> i).map(n=> <option key={n} value={String(n)}>{n}</option>)}
              </select>
              {prefsError && <div className="mt-2 text-sm text-red-600">{prefsError}</div>}
              {prefsSavedNotice && <div className="mt-2 text-sm text-green-700">{prefsSavedNotice}</div>}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setPrefsError(null);
                    setPrefsSavedNotice(null);
                    setBudgetDraft({ min: String(budgetSaved.min), max: String(budgetSaved.max) });
                    setForbidRepeatDaysDraft(String(forbidRepeatDaysSaved));
                  }}
                >
                  Reset to saved
                </button>
                <button className="btn-primary" onClick={savePreferences} disabled={prefsSaving}>{prefsSaving ? 'Saving…' : 'Save Preferences'}</button>
              </div>
            </div>

            <div className="card p-5">
              <div className="text-sm font-semibold mb-1">Today's Context</div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><div className="label">Condition</div><div className="text-lg font-semibold capitalize">{wx.condition}</div></div>
                <div><div className="label">Temp</div><div className="text-lg font-semibold">{wx.tempF}°F</div></div>
                <div><div className="label">30d Spend</div><div className="text-lg font-semibold">{currency(totalSpend30d)}</div></div>
              </div>
              <div className="mt-4 h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" hide /><YAxis hide /><Tooltip /><Line type="monotone" dataKey="spend" strokeWidth={2} dot={false} /></LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-5">
              <div className="text-sm font-semibold mb-1">Quick Filters</div>
              <div className="label">Search cuisines</div>
              <div className="mt-1 flex items-center gap-2"><input className="input" placeholder="e.g., Mexican, Ramen…" value={search} onChange={e=> setSearch(e.target.value)} /><button className="btn-ghost" onClick={()=> setSearch('')}><Filter className="h-4 w-4"/></button></div>
              <p className="mt-2 text-xs text-zinc-600">Tip: Load demo data, tweak budget, then crack the egg.</p>
            </div>
          </div>

          {/* Reveal Choices (Order Section) */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Top choices for you</div>
              <div className="flex items-center gap-2"><button className="btn-ghost inline-flex items-center gap-1" onClick={openScoreHelp}><Info className="h-4 w-4"/> Explain</button><button className="btn-ghost" onClick={()=> setOrderOpen(o=>!o)}>{orderOpen ? 'Hide' : 'Reveal Choices'}</button></div>
            </div>
            <div className="mt-1 text-xs text-zinc-600">Note: The first item here is exactly what the mystery egg will reveal.</div>
            {orderOpen && (
              <div className="mt-3 space-y-2">
                {rankedMeals.slice(0,5).map((s, idx) => (
                  <div key={s.meal.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="flex items-center gap-2">{idx===0 && <span className="badge">Chosen</span>}<div className="font-medium">{s.meal.dish} <span className="text-zinc-500">• {s.meal.cuisine}</span></div></div>
                      <div className="text-xs text-zinc-600">{s.meal.restaurant ?? 'Unknown'} • {currency(s.meal.cost)} • {s.meal.rating ?? '—'}★</div>
                    </div>
                    <button className="btn-primary" onClick={()=> { setIsOverride(true); setPicked({ key: s.meal.id, label: s.meal.cuisine, suggestedRestaurant: s.meal.restaurant ?? undefined, dish: s.meal.dish, estCost: s.meal.cost, score: 0, tier: deriveTier(s.meal.cost) }); setEggOpen(true); }}>Select</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Log Dinner */}
          <div className="card p-5">
            <div className="text-sm font-semibold mb-3">Log a Dinner</div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div><div className="label">Date</div><input className="input" type="date" value={date} onChange={e=> setDate(e.target.value)} /></div>
              <div><div className="label">Cost (USD)</div><input className="input" type="number" value={cost} onChange={e=> setCost(e.target.value)} /></div>
              <div><div className="label">Cuisine</div><input className="input" list="cuisine-list" value={cuisineInput} onChange={e=> setCuisineInput(e.target.value)} /><datalist id="cuisine-list">{['Mexican','Japanese','Italian','American','Thai','Indian','Ramen','Pho','Curry','Salad', ...cuisines].filter((v,i,a)=> a.indexOf(v)===i).map(c=> <option key={c} value={c} />)}</datalist></div>
              <div><div className="label">Restaurant</div><input className="input" value={restaurant} onChange={e=> setRestaurant(e.target.value)} placeholder="e.g., Chipotle" /></div>
              <div><div className="label">Dish</div><input className="input" value={dish} onChange={e=> setDish(e.target.value)} placeholder="e.g., Burrito Bowl" /></div>
              <div><div className="label">Rating (1-5)</div><input className="input" type="number" min={1} max={5} value={rating} onChange={e=> setRating(Math.max(1, Math.min(5, Number(e.target.value)||1)))} /></div>
              <div className="md:col-span-2 lg:col-span-3"><div className="label">Notes</div><textarea className="input" rows={2} value={notes} onChange={e=> setNotes(e.target.value)} placeholder="Any context, cravings, mood…" /></div>
            </div>
            <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={submitMeal}>Save Meal</button></div>
          </div>

          {/* History */}
          <div className="card p-5">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold">Dinner History</div><button className="btn-ghost" onClick={()=> setShowAllHistory(v=>!v)}>{showAllHistory ? 'View Last 5' : 'View All'}</button></div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr className="bg-zinc-50"><th className="th text-left">Date</th><th className="th text-left">Cuisine</th><th className="th text-left">Restaurant</th><th className="th text-left">Dish</th><th className="th text-right">Cost</th><th className="th text-center">Rating</th><th className="th text-center">Actions</th></tr></thead>
                <tbody>
                  {(showAllHistory ? meals : meals.slice(0,5)).map(m => (
                    <tr key={m.id} className="hover:bg-zinc-50">
                      <td className="td">{m.date.slice(0,10)}</td>
                      <td className="td">{m.cuisine}</td>
                      <td className="td">{m.restaurant ?? '—'}</td>
                      <td className="td">{m.dish}</td>
                      <td className="td text-right">{currency(m.cost)}</td>
                      <td className="td text-center">{m.rating ?? '—'}</td>
                      <td className="td text-center"><button className="btn-ghost" onClick={()=> startEdit(m)}>Edit</button><button className="btn-ghost" onClick={()=> deleteHistory(m.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

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

      {/* Browse detail modal with price history */}
      {browseDetailKey && (() => {
        const entry = browseEntries.find(e => e.key === browseDetailKey)!;
        const chart = entry.history.map(h => ({ date: new Date(h.date).toISOString().slice(0,10), price: h.cost }));
        return (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={closeBrowseDetail}>
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={e=> e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-lg font-semibold">{entry.latest.dish}</div>
                <div className="text-sm text-zinc-600">{entry.latest.restaurant ?? 'Unknown'} • {entry.latest.cuisine}</div>
              </div>
              <div className="text-sm">Latest price: <span className="font-semibold">{currency(entry.latest.cost)}</span></div>
              <div className="mt-3 h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={['auto','auto']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="price" strokeWidth={2} dot={true} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="btn-ghost" onClick={closeBrowseDetail}>Close</button>
                <button className="btn-primary" onClick={async ()=> { await addBrowseEntryToHistory(browseDetailKey); closeBrowseDetail(); }}>Add to Dinner History</button>
              </div>
            </div>
          </div>
        );
      })()}

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

      <EggGacha open={eggOpen} pick={picked} onClose={() => setEggOpen(false)} onOrder={handleOrder} confirmLabel={isOverride ? "Choose & Save" : "Save to Dinner History"} />

      <footer className="pb-8 pt-2 text-center text-xs text-zinc-500">Built for MVP demo • Data saved to Supabase database</footer>
    </div>
  );
}