#!/bin/bash

# FuDi Food Chooser - Supabase Setup Script
# This script helps you set up the Supabase backend

echo "🍕 FuDi Food Chooser - Supabase Setup"
echo "======================================"
echo ""

# Check if .env.local already exists
if [ -f ".env.local" ]; then
    echo "⚠️  .env.local already exists. Skipping environment setup."
    echo ""
else
    echo "📝 Setting up environment variables..."
    
    # Copy example file
    if [ -f "env.example" ]; then
        cp env.example .env.local
        echo "✅ Created .env.local from env.example"
        echo ""
        echo "🔑 Please edit .env.local with your Supabase credentials:"
        echo "   - VITE_SUPABASE_URL=your_project_url"
        echo "   - VITE_SUPABASE_ANON_KEY=your_anon_key"
        echo ""
        echo "   You can find these in your Supabase dashboard under Settings → API"
        echo ""
    else
        echo "❌ env.example not found. Please create it manually."
        exit 1
    fi
fi

# Check if dependencies are installed
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🎯 Next steps:"
echo "1. Create a Supabase project at https://supabase.com"
echo "2. Get your API keys from Settings → API"
echo "3. Update .env.local with your credentials"
echo "4. Run the SQL schema in Supabase SQL Editor (see supabase-schema.sql)"
echo "5. Start the app with: npm run dev"
echo ""
echo "📚 See SUPABASE_SETUP.md for detailed instructions"
echo ""
echo "🚀 Happy coding! 🍜🍔"
