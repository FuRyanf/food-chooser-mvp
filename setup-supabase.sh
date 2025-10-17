#!/bin/bash

echo "🍜 FuDi - Supabase Setup Helper"
echo "================================"
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
  echo "✅ .env.local already exists"
  echo ""
  read -p "Do you want to overwrite it? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Keeping existing .env.local"
  else
    cp env.example .env.local
    echo "✅ Created new .env.local from env.example"
  fi
else
  cp env.example .env.local
  echo "✅ Created .env.local from env.example"
fi

echo ""
echo "📋 Next Steps:"
echo ""
echo "1️⃣  Set up your Supabase project:"
echo "   • Go to https://supabase.com and create a new project"
echo "   • Wait for provisioning (~2 minutes)"
echo ""
echo "2️⃣  Get your credentials:"
echo "   • Go to Settings → API in your Supabase dashboard"
echo "   • Copy your Project URL and anon public key"
echo ""
echo "3️⃣  Update your .env.local file:"
echo "   • Open .env.local in your editor"
echo "   • Replace the placeholder values with your actual credentials"
echo ""
echo "4️⃣  Run the database setup:"
echo "   • Go to SQL Editor in Supabase dashboard"
echo "   • Copy contents of database-setup.sql"
echo "   • Run the complete script"
echo ""
echo "5️⃣  Set up Google OAuth:"
echo "   • Follow the guide in SETUP_GUIDE.md"
echo "   • Configure Google Cloud Console"
echo "   • Enable Google provider in Supabase Auth"
echo ""
echo "6️⃣  Start the development server:"
echo "   npm run dev"
echo ""
echo "📖 For detailed instructions, see:"
echo "   • README.md - Quick start and overview"
echo "   • SETUP_GUIDE.md - Complete setup walkthrough"
echo ""
echo "Need help? Check docs/README.md for additional resources!"
echo ""
