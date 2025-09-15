# 👥 Person Tracking & Spending Aggregates

This guide shows how to use the person tracking feature to see who bought what and view spending summaries.

## 🚀 Quick Setup

### 1. Run the Database Migration

Execute the SQL in `add-person-tracking.sql` in your Supabase SQL Editor:

```sql
-- This adds purchaser_name to both meals and groceries tables
-- Plus creates views for spending aggregates
```

### 2. Update Your Forms

When adding new meals or groceries, include the purchaser name:

```tsx
// Adding a meal with purchaser
const newMeal = {
  dish: "Pad Thai",
  restaurant: "Thai Garden",
  cuisine: "Thai",
  cost: 15.99,
  purchaser_name: "Ryan", // 👈 New field!
  rating: 5
};

await supabase.from('meals').insert([newMeal]);
```

```tsx
// Adding groceries with purchaser
const groceryTrip = {
  amount: 127.45,
  purchaser_name: "Rachel", // 👈 New field!
  notes: "Weekly shopping at Kroger"
};

await supabase.from('groceries').insert([groceryTrip]);
```

## 📊 Querying Spending Data

### Get Total Spending by Person

```tsx
// Get overview totals per person
const { data: personTotals } = await supabase
  .from('person_totals')
  .select('*');

// Result:
// [
//   {
//     purchaser_name: "Ryan",
//     total_transactions: 15,
//     total_spent: 342.67,
//     avg_per_category: 171.34,
//     first_purchase: "2025-01-01",
//     last_purchase: "2025-01-15"
//   },
//   {
//     purchaser_name: "Rachel", 
//     total_transactions: 12,
//     total_spent: 289.23,
//     avg_per_category: 144.62,
//     first_purchase: "2025-01-02", 
//     last_purchase: "2025-01-14"
//   }
// ]
```

### Get Detailed Breakdown by Category

```tsx
// Get detailed spending by person and category
const { data: spendingDetails } = await supabase
  .from('spending_summary')
  .select('*');

// Result:
// [
//   {
//     purchaser_name: "Ryan",
//     category: "meals",
//     transaction_count: 8,
//     total_amount: 156.32,
//     avg_amount: 19.54,
//     min_amount: 8.99,
//     max_amount: 45.67,
//     earliest_date: "2025-01-01",
//     latest_date: "2025-01-15"
//   },
//   {
//     purchaser_name: "Ryan",
//     category: "groceries", 
//     transaction_count: 3,
//     total_amount: 186.35,
//     avg_amount: 62.12,
//     min_amount: 45.23,
//     max_amount: 127.45,
//     earliest_date: "2025-01-03",
//     latest_date: "2025-01-12"
//   }
//   // ... more entries for Rachel
// ]
```

### Filter by Specific Person

```tsx
// Get just Ryan's spending
const { data: ryanSpending } = await supabase
  .from('spending_summary')
  .select('*')
  .eq('purchaser_name', 'Ryan');

// Get meals purchased by Rachel in January
const { data: rachelMeals } = await supabase
  .from('meals')
  .select('*')
  .eq('purchaser_name', 'Rachel')
  .gte('date', '2025-01-01')
  .lt('date', '2025-02-01');
```

## 🎨 UI Component Usage

Use the provided `SpendingSummary` component:

```tsx
import SpendingSummary from './components/SpendingSummary';

function App() {
  return (
    <div>
      {/* Your existing app */}
      
      {/* Add spending summary page/section */}
      <SpendingSummary />
    </div>
  );
}
```

## 📈 What You Get

### 1. **Person Totals View** (`person_totals`)
- Total spending per person across all categories
- Number of transactions
- Average spending per category  
- Date range of purchases

### 2. **Spending Summary View** (`spending_summary`)
- Breakdown by person AND category (meals vs groceries)
- Count, total, average, min/max amounts
- Date ranges per category

### 3. **Enhanced Tables**
- `meals` table now has `purchaser_name` field
- `groceries` table now has `purchaser_name` field
- Indexed for efficient querying

## 🔧 Customization Ideas

### Add More People
Simply use their names when inserting data:

```tsx
purchaser_name: "Alex"  // or "Mom", "Dad", etc.
```

### Monthly Reports
```tsx
// Get spending for current month
const { data: monthlySpending } = await supabase
  .from('spending_summary') 
  .select('*')
  .gte('earliest_date', '2025-01-01')
  .lt('latest_date', '2025-02-01');
```

### Budget Tracking Per Person
```tsx
// Check if someone is over budget
const { data: ryanTotal } = await supabase
  .from('person_totals')
  .select('total_spent')
  .eq('purchaser_name', 'Ryan')
  .single();

const budget = 400.00;
const isOverBudget = ryanTotal.total_spent > budget;
```

## 🎯 Next Steps

1. **Run the migration**: Execute `add-person-tracking.sql`
2. **Update your forms**: Add purchaser name fields to meal/grocery entry
3. **Add the component**: Include `SpendingSummary` in your app
4. **Test it**: Add some data with different purchaser names
5. **Customize**: Style the component to match your app's design

The views will automatically update as you add new meals and groceries with purchaser names! 🚀
