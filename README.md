# FuDi

A fun and interactive meal recommendation app built with **React**, **TypeScript**, **Tailwind CSS**, and **Framer Motion**.  
Includes a “Gacha Egg” animation inspired by Puzzles & Dragons — crack open the egg to reveal your meal surprise.

## Features

- Gacha Egg Animation – Rolling, bouncing, and cracking animation before revealing a meal pick.
- Weighted Random Selection – Picks meals based on configurable score weighting.
- Surprise Me – Let the algorithm choose for you, or override manually.
- Meal History – Tracks past chosen meals.
- Responsive UI – Works well on desktop and mobile.
- Tier-based Egg Designs – Bronze, Silver, Gold, Diamond with confetti.

## Getting Started

### Clone the repository
```bash
git clone https://github.com/<your-username>/food-chooser-mvp.git
cd food-chooser-mvp
```

### Install dependencies
```bash
npm install
```
Or use:
```bash
yarn install
```
or
```bash
pnpm install
```

### Start the development server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
food-chooser-mvp/
├── public/                # Static assets
│   ├── sfx/               # Sound effects (roll, crack, sparkle)
├── src/
│   ├── components/
│   │   ├── EggGacha.tsx   # Gacha animation component
│   │   ├── MealHistory.tsx
│   │   └── ...
│   ├── App.tsx            # Main app logic
│   └── ...
├── package.json
├── README.md
└── ...
```

## Configuration

- Meal Data – Currently stored locally in browser state. Future improvement could move this to a database or API.
- Tier Colors – Configurable in `TIER_GRADIENT` inside `EggGacha.tsx`.
- Animation Timings – Controlled via `setTimeout` hooks in `EggGacha`.

## Build for Production
```bash
npm run build
```
The build output will be in the `dist/` folder.

## Tech Stack

- React + TypeScript
- Tailwind CSS
- Framer Motion
- Lucide React Icons
- Vite

## License

MIT License © 2025 [Ryan Fu]
