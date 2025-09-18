import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DollarSign, Egg as EggIcon } from "lucide-react";

type EggTier = "Bronze" | "Silver" | "Gold" | "Diamond";
export type Recommendation = {
  key: string;
  label: string;
  suggestedRestaurant?: string;
  dish?: string;
  estCost: number;
  score: number;
  tier: EggTier;
};

type Props = {
  open: boolean;
  pick?: Recommendation;
  onClose: () => void;
  onOrder?: (rec: Recommendation) => void;       // NEW: callback to save
  confirmLabel?: string;                         // NEW: customize button label
  translate: (text: string) => string;
};

const TIER_GRADIENT: Record<EggTier, string> = {
  Bronze: "from-amber-700 via-amber-500 to-amber-300",
  Silver: "from-zinc-400 via-zinc-300 to-zinc-100",
  Gold: "from-yellow-500 via-amber-400 to-amber-200",
  Diamond: "from-cyan-300 via-blue-300 to-sky-100",
};

export default function EggGacha({ open, pick, onClose, onOrder, confirmLabel, translate }: Props) {
  // phases: roll -> bounce -> crack -> reveal
  const [phase, setPhase] = useState<"roll" | "bounce" | "crack" | "reveal">("roll");

  useEffect(() => {
    if (!open) return;
    setPhase("roll");
    const t1 = setTimeout(() => setPhase("bounce"), 900);
    const t2 = setTimeout(() => setPhase("crack"), 1700);
    const t3 = setTimeout(() => setPhase("reveal"), 2500);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [open]);

  const gradient = useMemo(
    () => (pick ? TIER_GRADIENT[pick.tier] : "from-zinc-300 via-zinc-200 to-zinc-100"),
    [pick]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
        <motion.div
          className="w-full max-w-4xl"
          onClick={(e) => e.stopPropagation()}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
        >
          <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-100 via-zinc-50 to-white dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900/60 dark:to-zinc-900">
              <img
                src="/fudi.png"
                alt={translate('FuDi holding a mystery egg')}
                className="h-full w-full object-cover object-center opacity-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent dark:from-black/50" />

              <div className="absolute bottom-10 left-1/2 w-full max-w-[180px] -translate-x-1/2">
                {phase === "reveal" ? (
                  <div className="relative h-40">
                    <motion.div
                      className={`absolute left-1/2 top-0 h-24 w-20 -translate-x-1/2 rounded-t-full bg-gradient-to-br ${gradient} shadow-xl`}
                      initial={{ y: 0, rotate: 0, opacity: 0 }}
                      animate={{ y: -78, rotate: -16, opacity: 1 }}
                    />
                    <motion.div
                      className={`absolute bottom-0 left-1/2 h-24 w-20 -translate-x-1/2 rounded-b-full bg-gradient-to-br ${gradient} shadow-xl`}
                      initial={{ y: 0, rotate: 0, opacity: 0 }}
                      animate={{ y: 46, rotate: 16, opacity: 1 }}
                    />
                    {[...Array(22)].map((_, i) => (
                      <motion.span
                        key={i}
                        className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white"
                        initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                        animate={{
                          opacity: [0, 1, 0],
                          scale: [0.5, 1.1, 0.8],
                          x: (Math.random() - 0.5) * 220,
                          y: -80 - Math.random() * 140,
                          rotate: Math.random() * 360,
                        }}
                        transition={{ duration: 1.2 + Math.random() * 0.5 }}
                      />
                    ))}
                  </div>
                ) : (
                  <motion.div
                    key={phase}
                    className="relative mx-auto h-40 w-32"
                    animate={(() => {
                      if (phase === "roll") {
                        return {
                          rotate: [-10, 10, -6, 6, 0],
                          y: [0, -12, 0],
                          transition: { duration: 1.6, repeat: Infinity, repeatType: "loop", ease: "easeInOut" },
                        };
                      }
                      if (phase === "bounce") {
                        return {
                          y: [0, -22, 0],
                          transition: { duration: 0.9, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
                        };
                      }
                      if (phase === "crack") {
                        return {
                          scale: [1, 1.04, 1],
                          transition: { duration: 0.6, repeat: 2, repeatType: "mirror", ease: "easeInOut" },
                        };
                      }
                      return {};
                    })()}
                  >
                    <div className={`mx-auto h-40 w-32 rounded-full bg-gradient-to-br ${gradient} shadow-2xl`} />
                    {phase !== "roll" && (
                      <motion.div
                        className="pointer-events-none absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: phase === "crack" ? 1 : 0 }}
                      >
                        <svg viewBox="0 0 160 200" className="h-full w-full">
                          <path
                            d="M80 40 L84 58 L72 82 L92 104 L78 128 L90 142"
                            stroke="white"
                            strokeWidth="3"
                            fill="none"
                            strokeLinecap="round"
                          />
                        </svg>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </div>

              {phase !== "reveal" && (
                <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-black/50 p-3 text-center text-xs text-white backdrop-blur">
                  {translate('FuDi is giving the egg a little shake…')}
                </div>
              )}
            </div>

            <div className="flex min-h-[360px] flex-col justify-center">
              <AnimatePresence mode="wait">
                {phase === "reveal" ? (
                  <motion.div
                    key="reveal"
                    className="card border border-amber-200/70 bg-white/80 p-5 shadow-xl dark:border-amber-400/30 dark:bg-zinc-900/80"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                  >
                    <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-600 dark:text-amber-200">
                      <EggIcon className="h-5 w-5" /> {translate('Your Mystery Pick')}
                    </div>
                    {pick ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-amber-300/70 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-300/30 dark:text-amber-200">{pick.tier}</span>
                          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">{pick.label}</span>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-white/70 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/70">
                          <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{translate('Suggested')}</div>
                          <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                            {pick.suggestedRestaurant ?? translate("Chef's Choice")}
                          </div>
                          <div className="text-sm text-zinc-600 dark:text-zinc-300">{pick.dish ?? translate('Signature dish')}</div>
                          <div className="mt-2 flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-200">
                            <DollarSign className="h-4 w-4" />
                            {translate('Est.')} ${pick.estCost.toFixed(2)}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button className="btn-outline" onClick={onClose}>{translate('Keep browsing')}</button>
                          <button
                            className="btn-primary"
                            onClick={() => {
                              if (pick && onOrder) onOrder(pick);
                              onClose();
                            }}
                          >
                            {confirmLabel ?? translate('Save to Meal History')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>{translate('No pick available.')}</div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="loading"
                    className="card border border-zinc-200/80 bg-white/70 p-5 text-center text-sm text-zinc-600 shadow dark:border-zinc-700/70 dark:bg-zinc-900/70 dark:text-zinc-300"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                  >
                    <div className="mb-2 text-base font-semibold text-zinc-800 dark:text-zinc-100">{translate('Hold tight...')}</div>
                    <p>{translate('FuDi is peeking inside the egg to find a delicious surprise.')}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
