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
};

const TIER_GRADIENT: Record<EggTier, string> = {
  Bronze: "from-amber-700 via-amber-500 to-amber-300",
  Silver: "from-zinc-400 via-zinc-300 to-zinc-100",
  Gold: "from-yellow-500 via-amber-400 to-amber-200",
  Diamond: "from-cyan-300 via-blue-300 to-sky-100",
};

export default function EggGacha({ open, pick, onClose, onOrder, confirmLabel }: Props) {
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
            className="relative w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
          >
            {/* Rolling Egg */}
            <div className="relative h-[320px] w-full overflow-visible">
              <AnimatePresence mode="popLayout">
                {phase !== "reveal" && (
                  <motion.div
                    key="egg"
                    className="absolute bottom-0 left-0 right-0 mx-auto"
                    initial={{ x: "-120%", rotate: -45 }}
                    animate={{
                      x: phase === "roll" ? "0%" : "0%",
                      rotate: phase === "roll" ? 0 : phase === "bounce" ? [0, -6, 5, -3, 2, 0] : 0,
                      y: phase === "bounce" ? [-2, -18, 0, -10, 0] : 0,
                      transition: {
                        duration: phase === "roll" ? 0.9 : 0.9,
                        ease: phase === "roll" ? "easeOut" : "easeOut",
                      },
                    }}
                  >
                    <motion.div
                      className={`mx-auto h-40 w-32 rounded-full bg-gradient-to-br ${gradient} shadow-2xl`}
                      animate={phase === "crack" ? { scale: [1, 1.02, 1, 1.02, 1] } : {}}
                      transition={{ duration: 0.6 }}
                    />
                    {/* crack line overlay */}
                    {phase !== "roll" && (
                      <motion.div
                        className="pointer-events-none mx-auto -mt-[148px] h-40 w-32"
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
              </AnimatePresence>

              {/* Crack apart to reveal */}
              {phase === "reveal" && (
                <>
                  <motion.div
                    className={`absolute bottom-20 left-1/2 h-24 w-20 -translate-x-1/2 rounded-t-full bg-gradient-to-br ${gradient} shadow-xl`}
                    initial={{ y: 0, rotate: 0 }}
                    animate={{ y: -80, rotate: -12, opacity: 1 }}
                  />
                  <motion.div
                    className={`absolute bottom-0 left-1/2 h-24 w-20 -translate-x-1/2 rounded-b-full bg-gradient-to-br ${gradient} shadow-xl`}
                    initial={{ y: 0, rotate: 0 }}
                    animate={{ y: 40, rotate: 12, opacity: 1 }}
                  />

                  {/* Confetti */}
                  {[...Array(16)].map((_, i) => (
                    <motion.span
                      key={i}
                      className="absolute bottom-28 left-1/2 h-2 w-2 -translate-x-1/2 rounded-sm bg-white/90"
                      initial={{ x: 0, y: 0, opacity: 0 }}
                      animate={{
                        x: (Math.random() - 0.5) * 220,
                        y: -120 - Math.random() * 80,
                        opacity: [0, 1, 0],
                        rotate: Math.random() * 360,
                      }}
                      transition={{ duration: 1.2 + Math.random() * 0.4 }}
                    />
                  ))}

                  {/* Reveal card */}
                  <motion.div
                    className="absolute left-1/2 top-1/2 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-2xl"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
                      <EggIcon className="h-5 w-5" /> Your Mystery Pick
                    </div>
                    {pick ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border px-2 py-0.5 text-xs">{pick.tier}</span>
                          <span className="rounded-full border px-2 py-0.5 text-xs">{pick.label}</span>
                        </div>
                        <div className="rounded-xl border p-3">
                          <div className="text-xs text-zinc-600">Suggested</div>
                          <div className="text-base font-semibold">
                            {pick.suggestedRestaurant ?? "Chef's Choice"}
                          </div>
                          <div className="text-sm">{pick.dish ?? "Signature dish"}</div>
                          <div className="mt-2 text-sm">
                            <DollarSign className="mr-1 inline h-4 w-4" />
                            Est. ${pick.estCost.toFixed(2)}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            className="inline-flex items-center rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                            onClick={onClose}
                          >
                            Close
                          </button>
                          <button
                            className="inline-flex items-center rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
                            onClick={() => {
                              if (pick && onOrder) onOrder(pick);  // NEW: save to history
                              onClose();
                            }}
                          >
                            {confirmLabel ?? "Save to Dinner History"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>No pick available.</div>
                    )}
                  </motion.div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}