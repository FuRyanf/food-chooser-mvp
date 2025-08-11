import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Egg, Filter, History, Sparkles } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import EggGacha from "./components/EggGacha";

type Meal = {
  id: string;
  date: string;
  restaurant?: string;
  dish: string;
  cuisine: string;
  cost: number;
  rating?: number;
  notes?: string;
};
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

// NEW: overrides map (cuisine -> count)
type Overrides = Record<string, number>;

const LS = {
  MEALS: 'foodchooser.meals.v1',
  BUDGET: 'foodchooser.budget.v1',
  OVERRIDES: 'foodchooser.overrides.v1',      // NEW
} as const;

const currency = (n:number)=> `$${n.toFixed(2)}`;
const todayISO = ()=> new Date().toISOString().slice(0,10);
const uid = ()=> Math.random().toString(36).slice(2,10);
const daysSince = (iso:string)=> Math.max(0, Math.floor((Date.now()-new Date(iso).getTime())/86400000));
function pseudoWeatherForDate(iso:string): Weather {
  const d = new Date(iso); const seed = (d.getMonth()+1)*37 + d.getDate()*17; const tempF = 50 + (seed % 50);
  let condition: Weather['condition'] = 'mild'; if (tempF>=85) condition='hot'; else if (tempF<=58) condition='cold'; if (seed%7===0) condition='rain';
  return { condition, tempF };
}
function deriveTier(cost:number): EggTier { if (cost<15) return 'Bronze'; if (cost<30) return 'Silver'; if (cost<55) return 'Gold'; return 'Diamond'; }

const seedMeals: Meal[] = [
  { id: uid(), date: new Date(Date.now()-86400000*6).toISOString(), cuisine:'Mexican', dish:'Chipotle Bowl', restaurant:'Chipotle', cost:14.5, rating:4 },
  { id: uid(), date: new Date(Date.now()-86400000*5).toISOString(), cuisine:'Japanese', dish:'Salmon Poke', restaurant:'Poke House', cost:19.2, rating:5 },
  { id: uid(), date: new Date(Date.now()-86400000*3).toISOString(), cuisine:'Italian', dish:'Margherita Pizza', restaurant:"Tony's", cost:24.0, rating:4 },
  { id: uid(), date: new Date(Date.now()-86400000*2).toISOString(), cuisine:'American', dish:'Smash Burger', restaurant:'Burger Bros', cost:16.0, rating:3 },
  { id: uid(), date: new Date(Date.now()-86400000*1).toISOString(), cuisine:'Thai', dish:'Pad See Ew', restaurant:'Thai Basil', cost:18.5, rating:5 },
];

// UPDATED: add overrides param and bonus to the score
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
    const avgCost = arr.reduce((s,m)=> s + m.cost, 0)/arr.length;
    const lastDays = daysSince(last.date);
    const recencyPenalty = lastDays <= forbidRepeatDays ? -100 : Math.max(-8, -1 * (6 - Math.min(6, lastDays)));
    const within = avgCost >= budget.min && avgCost <= budget.max;
    const budgetFit = within ? 12 : -Math.min(Math.abs(avgCost - (avgCost < budget.min ? budget.min : budget.max))/5, 10);
    const todayWx = pseudoWeatherForDate(todayISO());
    let weatherBonus = 0;
    if (todayWx.condition==='hot' && ['Japanese','Salad','Mexican'].includes(cuisine)) weatherBonus += 3;
    if (todayWx.condition==='cold' && ['Ramen','Indian','Italian'].includes(cuisine)) weatherBonus += 4;
    if (todayWx.condition==='rain' && ['Pho','Ramen','Curry'].includes(cuisine)) weatherBonus += 5;
    const last30 = arr.filter(m => daysSince(m.date) <= 30).length;
    const trend = last30 >= 2 && avgRating >= 4 ? 5 : 0;

    const overrideBonus = (overrides[cuisine] ?? 0) * 3; // NEW: +3 per manual choose

    const score = avgRating * 6 + recencyPenalty + budgetFit + weatherBonus + trend + overrideBonus;

    recs.push({
      key: cuisine,
      label: cuisine,
      suggestedRestaurant: sorted[0]?.restaurant,
      dish: sorted[0]?.dish,
      estCost: Math.round(avgCost*100)/100,
      score,
      tier: deriveTier(avgCost)
    });
  }
  return recs.sort((a,b)=> b.score - a.score);
}

export default function App() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [budget, setBudget] = useState<Budget>({ min: 10, max: 35 });
  const [forbidRepeatDays, setForbidRepeatDays] = useState(1);
  const [strictBudget, setStrictBudget] = useState(false);
  const [search, setSearch] = useState('');
  const [eggOpen, setEggOpen] = useState(false);
  const [picked, setPicked] = useState<Recommendation | undefined>();
  const [overrides, setOverrides] = useState<Overrides>({});     // NEW
  const [isOverride, setIsOverride] = useState(false);           // NEW: did user manually choose?

  useEffect(()=>{ 
    const m=localStorage.getItem(LS.MEALS);
    const b=localStorage.getItem(LS.BUDGET);
    const o=localStorage.getItem(LS.OVERRIDES);                  // NEW
    if (m) setMeals(JSON.parse(m));
    if (b) setBudget(JSON.parse(b));
    if (o) setOverrides(JSON.parse(o));                          // NEW
  }, []);
  useEffect(()=>{ localStorage.setItem(LS.MEALS, JSON.stringify(meals)); }, [meals]);
  useEffect(()=>{ localStorage.setItem(LS.BUDGET, JSON.stringify(budget)); }, [budget]);
  useEffect(()=>{ localStorage.setItem(LS.OVERRIDES, JSON.stringify(overrides)); }, [overrides]); // NEW

  const cuisines = useMemo(()=> [...new Set(meals.map(m=>m.cuisine))], [meals]);
  const wx = pseudoWeatherForDate(todayISO());
  const recs = useMemo(()=>{
    const r = buildRecommendations(meals, budget, forbidRepeatDays, overrides); // pass overrides
    return strictBudget ? r.filter(x=> x.estCost>=budget.min && x.estCost<=budget.max) : r;
  }, [meals, budget, forbidRepeatDays, strictBudget, overrides]);
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

  function seedDemo(){ setMeals(prev => [...prev, ...seedMeals].sort((a,b)=> +new Date(b.date) - +new Date(a.date))); }
  function addMeal(m:Meal){ setMeals(prev => [m, ...prev].sort((a,b)=> +new Date(b.date) - +new Date(a.date))); }
  function deleteMeal(id:string){ setMeals(prev => prev.filter(m=> m.id!==id)); }

  // UPDATED: crack egg via algorithmic pick (not override)
  function crackEgg(){
    setIsOverride(false); // ensure algorithmic flow
    if (!filteredRecs.length){ setPicked(undefined); setEggOpen(true); return; }
    const max = Math.max(...filteredRecs.map(r=>r.score));
    const weights = filteredRecs.map(r=> Math.exp((r.score - max)/8));
    const sum = weights.reduce((a,b)=> a+b, 0);
    let t = Math.random()*sum, i=0; for(; i<weights.length; i++){ t -= weights[i]; if (t<=0) break; }
    setPicked(filteredRecs[Math.min(i, filteredRecs.length-1)]); setEggOpen(true);
  }

  // Add meal form state
  const [date, setDate] = useState(todayISO());
  const [restaurant, setRestaurant] = useState('');
  const [dish, setDish] = useState('');
  const [cuisineInput, setCuisineInput] = useState('Mexican');
  const [cost, setCost] = useState('15');
  const [rating, setRating] = useState(4);
  const [notes, setNotes] = useState('');

  function submitMeal(){
    const meal: Meal = { id: uid(), date: new Date(date).toISOString(), restaurant: restaurant || undefined, dish: dish || "Chef's choice", cuisine: cuisineInput, cost: Math.max(0, Number(cost) || 0), rating, notes: notes || undefined };
    addMeal(meal);
    setDate(todayISO()); setRestaurant(''); setDish(''); setCuisineInput('Mexican'); setCost('15'); setRating(4); setNotes('');
  }

  // NEW: when user confirms in gacha, save to history and apply override boost if needed
  function handleOrder(rec: Recommendation) {
    const meal: Meal = {
      id: uid(),
      date: new Date().toISOString(),
      restaurant: rec.suggestedRestaurant,
      dish: rec.dish ?? rec.label,
      cuisine: rec.label,
      cost: rec.estCost,
    };
    addMeal(meal);

    if (isOverride) {
      setOverrides(prev => ({ ...prev, [rec.label]: (prev[rec.label] ?? 0) + 1 }));
    }
    setIsOverride(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            <h1 className="text-2xl font-bold md:text-3xl">FuDi</h1>
          </div>
          <p className="text-sm text-zinc-600">Smart, fun dinner picks — personalized by mood, budget, and weather.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-outline" onClick={seedDemo}><History className="h-4 w-4"/> Load Demo Data</button>
          <button className="btn-primary" onClick={crackEgg}><Egg className="h-4 w-4"/> Crack Mystery Egg</button>
        </div>
      </header>

      {/* Controls */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm font-semibold mb-1">Budget</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="label">Min</div>
              <input className="input" type="number" value={budget.min} onChange={e=> setBudget({...budget, min:Number(e.target.value)})} />
            </div>
            <div>
              <div className="label">Max</div>
              <input className="input" type="number" value={budget.max} onChange={e=> setBudget({...budget, max:Number(e.target.value)})} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={strictBudget} onChange={e=> setStrictBudget(e.target.checked)} />
            Strict budget only
          </label>
          <div className="mt-3 text-sm">No repeat within (days)</div>
          <select className="select mt-1" value={String(forbidRepeatDays)} onChange={e=> setForbidRepeatDays(Number(e.target.value))}>
            {[1,2,3,4,5,6,7].map(n=> <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="card p-5">
          <div className="text-sm font-semibold mb-1">Today’s Context</div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="label">Condition</div>
              <div className="text-lg font-semibold capitalize">{wx.condition}</div>
            </div>
            <div>
              <div className="label">Temp</div>
              <div className="text-lg font-semibold">{wx.tempF}°F</div>
            </div>
            <div>
              <div className="label">30d Spend</div>
              <div className="text-lg font-semibold">{currency(totalSpend30d)}</div>
            </div>
          </div>
          <div className="mt-4 h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Tooltip />
                <Line type="monotone" dataKey="spend" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <div className="text-sm font-semibold mb-1">Quick Filters</div>
          <div className="label">Search cuisines</div>
          <div className="mt-1 flex items-center gap-2">
            <input className="input" placeholder="e.g., Mexican, Ramen…" value={search} onChange={e=> setSearch(e.target.value)} />
            <button className="btn-ghost" onClick={()=> setSearch('')}><Filter className="h-4 w-4"/></button>
          </div>
          <p className="mt-2 text-xs text-zinc-600">Tip: Load demo data, tweak budget, then crack the egg.</p>
        </div>
      </div>

      {/* Log Dinner */}
      <div className="card p-5">
        <div className="text-sm font-semibold mb-3">Log a Dinner</div>
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
            <input className="input" value={restaurant} onChange={e=> setRestaurant(e.target.value)} placeholder="e.g., Chipotle" />
          </div>
          <div>
            <div className="label">Dish</div>
            <input className="input" value={dish} onChange={e=> setDish(e.target.value)} placeholder="e.g., Burrito Bowl" />
          </div>
          <div>
            <div className="label">Rating (1-5)</div>
            <input className="input" type="number" min={1} max={5} value={rating} onChange={e=> setRating(Math.max(1, Math.min(5, Number(e.target.value)||1)))} />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <div className="label">Notes</div>
            <textarea className="input" rows={2} value={notes} onChange={e=> setNotes(e.target.value)} placeholder="Any context, cravings, mood…" />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button className="btn-primary" onClick={submitMeal}>Save Meal</button>
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Recommendations</div>
          <div className="text-xs text-zinc-600">{filteredRecs.length} options</div>
        </div>
        {filteredRecs.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredRecs.map(r => (
              <div key={r.key} className="card p-5 hover:shadow-lg transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="badge">{r.tier}</span>
                    <div className="font-semibold">{r.label}</div>
                  </div>
                  <span className="badge border-zinc-300">{currency(r.estCost)}</span>
                </div>
                <div className="mt-2 text-sm text-zinc-600">Score {Math.round(r.score)}</div>
                <div className="mt-2 text-sm">Latest: <span className="font-medium">{r.suggestedRestaurant ?? "Chef's Choice"}</span></div>
                <div className="text-sm text-zinc-600">Dish: {r.dish ?? 'Signature'}</div>
                <div className="mt-3 flex justify-end">
                  {/* UPDATED: Choose Meal (override) */}
                  <button
                    className="btn-primary"
                    onClick={() => { setIsOverride(true); setPicked(r); setEggOpen(true); }}
                    title="Override the algorithm with this pick"
                  >
                    Choose Meal
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-sm text-zinc-600">No recommendations yet. Log a dinner or load demo data.</div>
        )}
      </div>

      {/* History */}
      <div className="card p-5">
        <div className="text-sm font-semibold mb-3">Dinner History</div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="bg-zinc-50">
                <th className="th text-left">Date</th>
                <th className="th text-left">Cuisine</th>
                <th className="th text-left">Restaurant</th>
                <th className="th text-left">Dish</th>
                <th className="th text-right">Cost</th>
                <th className="th text-center">Rating</th>
                <th className="th text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meals.map(m => (
                <tr key={m.id} className="hover:bg-zinc-50">
                  <td className="td">{m.date.slice(0,10)}</td>
                  <td className="td">{m.cuisine}</td>
                  <td className="td">{m.restaurant ?? '—'}</td>
                  <td className="td">{m.dish}</td>
                  <td className="td text-right">{currency(m.cost)}</td>
                  <td className="td text-center">{m.rating ?? '—'}</td>
                  <td className="td text-center">
                    <button className="btn-ghost" onClick={()=> deleteMeal(m.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gacha modal: now saves to history and respects overrides */}
      <EggGacha
        open={eggOpen}
        pick={picked}
        onClose={() => setEggOpen(false)}
        onOrder={handleOrder}
        confirmLabel={isOverride ? "Choose & Save" : "Save to Dinner History"}
      />

      <footer className="pb-8 pt-2 text-center text-xs text-zinc-500">Built for MVP demo • Data saved to your browser (localStorage)</footer>
    </div>
  );
}