/**
 * Choose the Other-item matching thresholds from hand-labelled pairs.
 *
 * Usage: npm run calibrate
 *
 * Reads tools/match-pairs.json, scores every pair with the shipped embedding
 * model, and writes src/categories/thresholds.json.
 *
 * - The pre-select threshold sits just above the highest-scoring pair that
 *   should not merge, so pre-selection is never wrong on the labelled set.
 * - The offer threshold best separates the two groups. It maximizes the share
 *   of should-merge pairs at or above it, minus the share of should-not-merge
 *   pairs at or above it. Below it, a new category is proposed, and staff
 *   can still pick any category.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { cosine, loadEmbedder } from "../src/categories/embedder";
import { normalizeText } from "../src/core/normalize";

interface Pair {
  item: string;
  category: string;
  same: boolean;
}

const MARGIN = 0.02;

function report(label: string, t: number, scored: { pair: Pair; score: number }[]) {
  const above = scored.filter((s) => s.score >= t);
  const tp = above.filter((s) => s.pair.same).length;
  const positives = scored.filter((s) => s.pair.same).length;
  const precision = above.length ? tp / above.length : 1;
  const recall = tp / positives;
  console.log(`${label} ${t.toFixed(3)}: precision ${(precision * 100).toFixed(1)}%, recall ${(recall * 100).toFixed(1)}% (${above.length} pairs at or above)`);
  return { precision: +precision.toFixed(3), recall: +recall.toFixed(3) };
}

async function main() {
  const { pairs } = JSON.parse(readFileSync("tools/match-pairs.json", "utf8")) as { pairs: Pair[] };
  const embed = loadEmbedder();
  const scored: { pair: Pair; score: number }[] = [];
  for (const pair of pairs) {
    const [a, b] = await embed([normalizeText(pair.item), normalizeText(pair.category)]);
    scored.push({ pair, score: cosine(a, b) });
  }
  scored.sort((a, b) => b.score - a.score);
  for (const s of scored) console.log(`${s.score.toFixed(3)} ${s.pair.same ? "same" : "diff"}  ${s.pair.item} | ${s.pair.category}`);

  const worstDifferent = Math.max(...scored.filter((s) => !s.pair.same).map((s) => s.score));
  const autoSelect = +(worstDifferent + MARGIN).toFixed(3);
  const positives = scored.filter((s) => s.pair.same).length;
  const negatives = scored.length - positives;
  let offer = 0;
  let bestJ = -Infinity;
  for (const { score: t } of scored) {
    const tpr = scored.filter((s) => s.pair.same && s.score >= t).length / positives;
    const fpr = scored.filter((s) => !s.pair.same && s.score >= t).length / negatives;
    if (tpr - fpr > bestJ) {
      bestJ = tpr - fpr;
      offer = +t.toFixed(3);
    }
  }

  const auto = report("pre-select", autoSelect, scored);
  const off = report("offer", offer, scored);
  writeFileSync(
    "src/categories/thresholds.json",
    JSON.stringify(
      {
        autoSelect,
        offer,
        calibratedOn: `${pairs.length} labelled pairs in tools/match-pairs.json`,
        autoSelectPrecision: auto.precision,
        autoSelectRecall: auto.recall,
        offerRecall: off.recall,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("wrote src/categories/thresholds.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
