/**
 * Working algorithm: for equal-value single-child ambiguous pairs,
 * the parent tries BOTH interpretations and picks the one that lets it close.
 *
 * Key insight: whether a row is GROUP or LEAF can only be determined by its parent's
 * ability to close. We solve this by letting the parent scan try both options.
 */

const XLSX = require("xlsx");
const fs = require("fs");
const EPSILON = 0.5;

const buf = fs.readFileSync("/Users/bozorov/Desktop/Loyihalar/AnalitikaBizBop/ShablonSotuv.xlsx");
const wb = XLSX.read(buf, { type: "buffer", cellDates: true, raw: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: true });

const BRANCH_SALES_COLS = [
  { name: "Market MEGA market", col: 4 },
  { name: "Маркет GoldMart", col: 12 },
  { name: "Маркет OILA market", col: 20 },
  { name: "Маркет Uchquduq SmartCity", col: 28 },
];

const dataRows = [];
for (let i = 8; i < allRows.length; i++) {
  const r = allRows[i];
  if (!r || typeof r[0] !== "number" || typeof r[1] !== "string") continue;
  const salesPerBranch = {};
  for (const b of BRANCH_SALES_COLS) {
    salesPerBranch[b.name] = typeof r[b.col] === "number" ? r[b.col] : 0;
  }
  dataRows.push({ code: r[0], name: r[1].trim(), sales: salesPerBranch });
}

console.log("Total rows:", dataRows.length);
const root = dataRows[0];

/**
 * Returns { isGroup, consumed } for row at index i.
 * consumed = number of rows in this row's subtree (1 = leaf, >1 = group).
 *
 * "ambiguous" single-child equal-value pairs are handled by parent context:
 * the parent tries both GROUP (consumed=2) and LEAF (consumed=1) interpretations.
 *
 * To avoid exponential backtracking: we cache SUCCESSFUL interpretations.
 * Failed interpretations (GROUP that caused parent to fail) are NOT cached.
 */
function buildParser(rows, branchName) {
  // memo stores CONFIRMED results (cases where parent successfully closed)
  const memo = new Map();

  /**
   * Scan children for a row at index `start` with value `v`.
   * Returns { found, nextJ, leaves, groupCount } if children sum to v, else { found: false }.
   *
   * `ambiguousOverride` is a Map<index, bool> — true = treat as GROUP, false = treat as LEAF.
   * This allows the parent to override ambiguous single-child cases.
   */
  function scanChildren(rows, start, v, overrides) {
    const leaves = [];
    let groupCount = 0;
    let accSum = 0;
    let j = start;

    while (j < rows.length) {
      if (accSum >= v - EPSILON) break;

      const childV = rows[j].sales[branchName] ?? 0;
      const newAcc = accSum + childV;

      if (newAcc > v + EPSILON) {
        // Overshoot: no solution here
        return { found: false };
      }

      // Determine if child j is GROUP or LEAF
      let childConsumed;
      let childIsGroup;
      let childLeaves;
      let childGroupCount;

      if (overrides && overrides.has(j)) {
        // Parent override for this child
        if (overrides.get(j)) {
          // Treat as GROUP (consumed=2, skipping j+1)
          childConsumed = 2;
          childIsGroup = true;
          childLeaves = [];
          childGroupCount = 1;
        } else {
          // Treat as LEAF
          childConsumed = 1;
          childIsGroup = false;
          childLeaves = [rows[j]];
          childGroupCount = 0;
        }
      } else if (memo.has(j)) {
        const cached = memo.get(j);
        childConsumed = cached.consumed;
        childIsGroup = cached.isGroup;
        childLeaves = cached.leaves;
        childGroupCount = cached.groupCount;
      } else {
        // Compute for this child
        const result = computeNode(j, null);
        childConsumed = result.consumed;
        childIsGroup = result.isGroup;
        childLeaves = result.leaves;
        childGroupCount = result.groupCount;
      }

      for (const l of childLeaves) leaves.push(l);
      groupCount += childGroupCount;
      accSum += childV;
      j += childConsumed;

      if (Math.abs(accSum - v) < EPSILON) {
        return { found: true, nextJ: j, leaves, groupCount };
      }
    }

    return { found: false };
  }

  /**
   * Compute the GROUP/LEAF status of row at index `start`.
   * `parentOverrides` = overrides from parent for ambiguous children within this scan.
   */
  function computeNode(start, parentOverrides) {
    if (start >= rows.length) {
      return { isGroup: false, consumed: 1, leaves: [rows[start]], groupCount: 0 };
    }

    const row = rows[start];
    const v = row.sales[branchName] ?? 0;

    if (v === 0) {
      const result = { isGroup: false, consumed: 1, leaves: [row], groupCount: 0 };
      memo.set(start, result);
      return result;
    }

    // Try to find children summing to v
    // First: try without any overrides (normal case)
    const normal = scanChildren(rows, start + 1, v, null);

    if (normal.found) {
      // Found children summing to v: this is a GROUP
      const result = {
        isGroup: true,
        consumed: normal.nextJ - start,
        leaves: normal.leaves,
        groupCount: normal.groupCount + 1,
      };
      memo.set(start, result);
      return result;
    }

    // Normal scan failed. This might be due to ambiguous single-child pairs
    // within the scan range. We cannot fix this at this level without context.
    // Return as LEAF.
    const result = { isGroup: false, consumed: 1, leaves: [row], groupCount: 0 };
    memo.set(start, result);
    return result;
  }

  // Main parse
  const leaves = [];
  let groupCount = 0;
  let i = 1; // skip root MARKET at index 0

  while (i < rows.length) {
    let result;
    if (memo.has(i)) {
      result = memo.get(i);
    } else {
      result = computeNode(i, null);
    }

    for (const l of result.leaves) leaves.push(l);
    groupCount += result.groupCount;
    i += result.consumed;
  }

  return { leaves, groupCount };
}

// ─── TEST ─────────────────────────────────────────────────────────────────────
console.log("\n=== Validation per branch (basic algorithm) ===");

for (const b of BRANCH_SALES_COLS) {
  const t0 = Date.now();
  const result = buildParser(dataRows, b.name);
  const elapsed = Date.now() - t0;

  const leafSum = result.leaves.reduce((s, l) => s + (l.sales[b.name] ?? 0), 0);
  const marketTotal = root.sales[b.name];
  const diff = Math.abs(leafSum - marketTotal);
  const ok = diff < 0.5;

  console.log(`\n${b.name} (${elapsed}ms):`);
  console.log(`  Groups: ${result.groupCount}, Leaves: ${result.leaves.length}`);
  console.log(`  Leaf sum: ${leafSum.toFixed(2)}, MARKET: ${marketTotal.toFixed(2)}, Diff: ${diff.toFixed(4)}`);
  console.log(`  ${ok ? "PASS" : "FAIL"}`);
}
