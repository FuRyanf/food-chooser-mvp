import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/supabase';

type PersonTotal = Database['public']['Views']['person_totals']['Row'];
type SpendingSummary = Database['public']['Views']['spending_summary']['Row'];

export default function SpendingSummary() {
  const [personTotals, setPersonTotals] = useState<PersonTotal[]>([]);
  const [spendingDetails, setSpendingDetails] = useState<SpendingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSpendingData();
  }, []);

  const fetchSpendingData = async () => {
    if (!supabase) {
      setError('Supabase client not available');
      setLoading(false);
      return;
    }

    try {
      // Fetch person totals
      const { data: totalsData, error: totalsError } = await supabase
        .from('person_totals')
        .select('*');

      if (totalsError) throw totalsError;

      // Fetch detailed spending breakdown
      const { data: detailsData, error: detailsError } = await supabase
        .from('spending_summary')
        .select('*');

      if (detailsError) throw detailsError;

      setPersonTotals(totalsData || []);
      setSpendingDetails(detailsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-4">Loading spending data...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">💰 Spending Summary</h1>

      {/* Person Totals Overview */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Total Spending by Person</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {personTotals.map((person) => (
            <div key={person.purchaser_name} className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-lg text-blue-600">
                {person.purchaser_name}
              </h3>
              <div className="mt-2 space-y-1 text-sm">
                <p><strong>Total Spent:</strong> ${person.total_spent.toFixed(2)}</p>
                <p><strong>Transactions:</strong> {person.total_transactions}</p>
                <p><strong>Avg per Category:</strong> ${person.avg_per_category.toFixed(2)}</p>
                <p><strong>First Purchase:</strong> {new Date(person.first_purchase).toLocaleDateString()}</p>
                <p><strong>Last Purchase:</strong> {new Date(person.last_purchase).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Detailed Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Person</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Count</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Avg</th>
                <th className="px-4 py-2 text-right">Min</th>
                <th className="px-4 py-2 text-right">Max</th>
              </tr>
            </thead>
            <tbody>
              {spendingDetails.map((row, index) => (
                <tr key={index} className="border-t">
                  <td className="px-4 py-2 font-medium">{row.purchaser_name}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-sm ${
                      row.category === 'meals' 
                        ? 'bg-orange-100 text-orange-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {row.category === 'meals' ? '🍽️ Meals' : '🛒 Groceries'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{row.transaction_count}</td>
                  <td className="px-4 py-2 text-right font-semibold">
                    ${row.total_amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right">${row.avg_amount.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">${row.min_amount.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">${row.max_amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800">Total Combined</h3>
          <p className="text-2xl font-bold text-blue-600">
            ${personTotals.reduce((sum, p) => sum + p.total_spent, 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <h3 className="font-semibold text-orange-800">Meal Spending</h3>
          <p className="text-2xl font-bold text-orange-600">
            ${spendingDetails
              .filter(s => s.category === 'meals')
              .reduce((sum, s) => sum + s.total_amount, 0)
              .toFixed(2)
            }
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="font-semibold text-green-800">Grocery Spending</h3>
          <p className="text-2xl font-bold text-green-600">
            ${spendingDetails
              .filter(s => s.category === 'groceries')
              .reduce((sum, s) => sum + s.total_amount, 0)
              .toFixed(2)
            }
          </p>
        </div>
      </div>
    </div>
  );
}

// Example of how to add purchaser when creating new records
export const addMealWithPurchaser = async (mealData: {
  dish: string;
  restaurant?: string;
  cuisine: string;
  cost: number;
  purchaser_name: string;
  rating?: number;
  notes?: string;
}) => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('meals')
    .insert([{
      user_id: 'demo-user-123',
      date: new Date().toISOString(),
      dish: mealData.dish,
      restaurant: mealData.restaurant,
      cuisine: mealData.cuisine,
      cost: mealData.cost,
      purchaser_name: mealData.purchaser_name,
      rating: mealData.rating,
      notes: mealData.notes,
      seed_only: false
    }])
    .select();

  if (error) {
    console.error('Error adding meal:', error);
    return null;
  }

  return data;
};

export const addGroceryWithPurchaser = async (groceryData: {
  amount: number;
  purchaser_name: string;
  notes?: string;
}) => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('groceries')
    .insert([{
      user_id: 'demo-user-123',
      date: new Date().toISOString(),
      amount: groceryData.amount,
      purchaser_name: groceryData.purchaser_name,
      notes: groceryData.notes
    }])
    .select();

  if (error) {
    console.error('Error adding grocery:', error);
    return null;
  }

  return data;
};
