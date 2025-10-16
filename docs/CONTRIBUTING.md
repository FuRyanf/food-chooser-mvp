# Contributing to FuDi

Thank you for your interest in contributing to FuDi! This document provides guidelines for repository structure, coding standards, and development workflow.

---

## 📁 Project Structure & Module Organization

### Source Code Layout
- **Entry Point**: `src/main.tsx` (React initialization)
- **Main Component**: `src/App.tsx` (primary UI state)
- **Feature Components**: `src/components/` (EggGacha, SpendingSummary, etc.)
- **API Layer**: `src/lib/api.ts` (Supabase operations)
- **Database Client**: `src/lib/supabase.ts` (typed Supabase client)
- **Schemas**: `database-setup-complete.sql` (complete setup)
- **Incremental Updates**: Individual `.sql` files (e.g., `add-person-tracking.sql`)
- **Static Assets**: `public/` (logo, sound effects in `public/sfx`)
- **Build Output**: `dist/` (production builds)

### File Naming Conventions
- **Components**: PascalCase (e.g., `EggGacha.tsx`)
- **Utilities**: camelCase (e.g., `api.ts`, `supabase.ts`)
- **Constants**: UPPER_SNAKE_CASE in code
- **SQL Files**: kebab-case (e.g., `add-person-tracking.sql`)

---

## 🛠️ Build, Test, and Development Commands

### Installation
```bash
npm install       # Install dependencies (or yarn/pnpm)
```

### Development
```bash
npm run dev       # Start Vite dev server at http://localhost:5173
```

### Production Build
```bash
npm run build     # Runs `tsc -b && vite build`
npm run preview   # Preview production build locally
```

### Database Setup
```bash
./setup-supabase.sh   # Scaffold .env.local and review checklist
```
See `SETUP_GUIDE.md` for detailed Supabase configuration.

---

## 🎨 Coding Style & Naming Conventions

### TypeScript
- **Strict Mode**: Enabled (`tsconfig.json`)
- **Type Safety**: Import types from `src/lib/supabase.ts`
- **No `any`**: Use proper types or `unknown`

### React
- **Functional Components**: Always use function components
- **Hooks**: Prefer hooks for state and effects
- **Arrow Functions**: Use for component definitions and callbacks
```tsx
// Good
const MyComponent = () => {
  const [state, setState] = useState(0);
  return <div>{state}</div>;
};

// Avoid
function MyComponent() { ... }
```

### Formatting
- **Indentation**: 2 spaces (not tabs)
- **Quotes**: Single quotes for strings
- **Template Literals**: Use for interpolation only
```typescript
// Good
const name = 'FuDi';
const greeting = `Hello, ${name}`;

// Avoid
const name = "FuDi";  // double quotes
const simple = `Static text`;  // unnecessary template literal
```

### Naming
- **Components**: PascalCase (`EggGacha`, `SpendingSummary`)
- **Functions**: camelCase (`fetchMeals`, `calculateScore`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_BUDGET`, `DEFAULT_DAYS`)
- **Interfaces/Types**: PascalCase (`User`, `MealData`)

### Styling
- **Tailwind CSS**: Primary styling method
- **Global Styles**: `src/index.css` for shared rules
- **No Inline Styles**: Use Tailwind utilities
```tsx
// Good
<div className="flex items-center gap-2">

// Avoid
<div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
```

### Supabase
- **Typed Definitions**: Import from `src/lib/supabase.ts`
- **API Layer**: Use `FoodChooserAPI` methods in `src/lib/api.ts`
- **Never Redefine**: Don't recreate table types
```typescript
// Good
import { Database } from './lib/supabase';
type Meal = Database['public']['Tables']['meals']['Row'];

// Avoid
interface Meal { id: string; ... }  // don't redefine
```

---

## 🧪 Testing Guidelines

### Current State
Automated tests are **not yet configured**. We rely on manual testing.

### Before Submitting Changes
Run these manual test passes:
1. **Start dev server**: `npm run dev`
2. **Sign in**: Test Google OAuth flow
3. **Surprise Me**: Verify gacha egg animation
4. **Add Meal**: Test manual meal entry
5. **Edit History**: Modify and delete existing meals
6. **Grocery Tracking**: Add grocery purchases
7. **Preferences**: Update budget and settings
8. **Household**: View and manage members

### Testing Specific Features
When touching these areas, add inline notes with expected behavior:
- **Scoring Logic**: Document weight calculations
- **Weather Integration**: Note hot/cold meal logic
- **Budget Constraints**: Explain filtering rules
- **Supabase Operations**: List expected CRUD paths

### Future Testing
When behavior stabilizes, consider:
- **Vitest** for unit tests
- **Playwright** for E2E tests
- **React Testing Library** for component tests

---

## 📝 Commit & Pull Request Guidelines

### Commit Messages
Keep commits **short, imperative, and scoped**:
```bash
# Good
git commit -m "Fix meal fetch pagination"
git commit -m "Add diamond egg confetti"
git commit -m "Update RLS policy for households"

# Avoid
git commit -m "Fixed some stuff"
git commit -m "WIP"
git commit -m "asdfasdf"
```

### Commit Body (Optional)
Reference SQL migrations or config tweaks:
```bash
git commit -m "Add household member invitations

- Created invite_token column in household_members
- Updated add-household-invites.sql migration
- Modified HouseholdSettings component
"
```

### Pull Requests
Include the following in your PR:
1. **Summary**: Brief description of the change
2. **UI Impact**: Screenshots/GIFs for visual changes
3. **Manual Test Steps**: How to verify the change
4. **Schema Updates**: Any database migrations required
5. **Environment Updates**: New env vars or Supabase config

#### PR Template
```markdown
## Summary
Brief description of what changed and why.

## Changes
- Added feature X
- Fixed bug Y
- Updated component Z

## Screenshots
(Add screenshots/GIFs if UI changed)

## Testing
1. Run `npm run dev`
2. Navigate to [feature area]
3. Verify [expected behavior]

## Schema Changes
- [ ] Ran `new-migration.sql`
- [ ] Updated `database-setup-complete.sql`
- [ ] No schema changes

## Environment
- [ ] New environment variables (list them)
- [ ] Updated `.env.example`
- [ ] No env changes
```

---

## 🗄️ Supabase & Environment Notes

### Environment Variables
- **Never commit**: `.env.local` is gitignored
- **Keep in sync**: Update both `env.example` and `.env.local`
- **Production**: Set in Vercel dashboard

### Schema Migrations
When altering database tables:
1. Create a new migration file (e.g., `add-feature-name.sql`)
2. Update `database-setup-complete.sql` to include the changes
3. Document in PR description
4. Test migration on a fresh Supabase project

### Keep-Alive Scheduling
If you adjust scheduling logic:
1. Update `.github/workflows/keep-supabase-alive.yml`
2. Document changes in `SETUP_GUIDE.md`
3. Test workflow runs

---

## 🚀 Development Workflow

### Starting New Work
1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make changes
3. Test manually
4. Commit with descriptive messages
5. Push and create PR

### Code Review
- All PRs require review
- Address feedback promptly
- Keep PRs focused (one feature per PR)

### Merging
- Squash commits if many small ones
- Use merge commits for feature branches
- Delete branch after merge

---

## 📚 Additional Resources

- **Main README**: [README.md](../README.md)
- **Setup Guide**: [SETUP_GUIDE.md](../SETUP_GUIDE.md)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Vite Docs**: [vitejs.dev](https://vitejs.dev/)
- **React Docs**: [react.dev](https://react.dev/)

---

## ❓ Questions?

Open an issue or discussion on GitHub!

---

**Thank you for contributing to FuDi! 🍜✨**

