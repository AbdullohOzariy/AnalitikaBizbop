/**
 * Temporary validation script for ShablonSotuv.xlsx subtotal-reconstruction.
 * Run: node scripts/validate-sales-parse.js
 * Delete after validation passes.
 *
 * Algorithm: bottom-up stack accumulator (O(n) single pass).
 *
 * 1C report is pre-order: parent before children.
 * Each GROUP row value == sum of its direct children's values.
 * (Children values are themselves subtotals for nested groups, or SKU sales for leaves.)
 *
 * THE CORRECT O(n) ALGORITHM — "collapsing stack":
 *
 * We maintain a stack of accumulated "pending nodes".
 * For each new row R (value v):
 *   1. Push R onto a "pending" stack with value v.
 *   2. Collapse: while stack has >= 2 entries AND the SUM of ALL entries
 *      AFTER the second-to-last entry equals the second-to-last entry's value:
 *      this means the second-to-last entry is a GROUP whose children are all the
 *      entries above it. Merge them: the GROUP is confirmed, its accumulated leaf sum
 *      is propagated upward.
 *
 * This is EXACTLY how a shift-reduce parser works for left-recursive grammars.
 *
 * Implementation: instead of tracking all stack entries, we track:
 *   stack = [{ v, accSum, leafCount, leafSales }]
 * where accSum = sum of DIRECT children values pushed so far for this entry.
 *
 * For each row R (value v):
 *   1. Subtract v from stack.top.accSum (adding as child of top).
 *      Wait — this is wrong because top might itself be a leaf, not a group.
 *
 * Let me use a cleaner formulation:
 *
 * STACK = [{v, pendingSum, leaves}]
 * pendingSum = amount still needed to "close" this potential group
 *              starts at v, decrements as children are consumed.
 *
 * For each row R (value v):
 *   Try to close any open group that this row completes.
 *   If no open group is closed, R is either:
 *     - A leaf (if it doesn't match any pending sum)
 *     - A new potential group parent
 *
 * The key insight for O(n): we process GREEDILY.
 * When R arrives, check if R alone closes the current group (pendingSum - v ~= 0).
 * If yes: close the group, add R's leaves to group's leaves, propagate to parent.
 * If not: R might be a sub-group. Push R as new potential group.
 *
 * This still has the same ambiguity issue.
 *
 * === FINAL CORRECT APPROACH ===
 *
 * Use the recursive descent with INDEX ADVANCEMENT (not slicing).
 * This is O(n) because each row is visited exactly once.
 *
 * parse(i, end, targetSum) -> { leaves, groupCount, nextI }
 *   Consumes rows starting at i, stopping when accumulated sum of DIRECT children == targetSum.
 *   "DIRECT children" means each immediate child is either:
 *     - A leaf (its value is consumed directly), or
 *     - A group (its value is consumed, and we recursively parse its sub-children).
 *
 * How do we know if row i is a group or leaf?
 *   We try to parse it as a group: call parse(i+1, end, v).
 *   If it successfully consumes children summing to v, then row i IS a group.
 *   If not, row i is a leaf.
 *
 *   BUT: "try to parse" would revisit rows = O(n²).
 *
 * KEY OPTIMIZATION: We don't need to "try" both paths.
 * In the recursive descent, when we call parse(i, end, targetSum):
 *   - We iterate consuming children. For each child at position j:
 *     - We tentatively consume child j by calling consumeOne(j, end).
 *     - consumeOne returns either (LEAF, v, nextJ=j+1) or (GROUP, v, nextJ=after_group).
 *     - Either way, we add v to our accumulated sum and continue from nextJ.
 *   - The GROUP/LEAF decision is made by consumeOne which TRIES to parse j+1..end as j's children.
 *   - This is still recursive but EACH ROW IS VISITED AT MOST O(depth) TIMES.
 *   - For a balanced tree of depth D, this is O(n * D).
 *   - For the 1C report (depth typically 5-8), this is effectively O(n).
 *
 * consumeOne(i, end) -> { isGroup, v, leaves, groupCount, nextI }
 *   Tries to parse row i as a group by recursively consuming its children.
 *   If it succeeds (children sum == v): returns isGroup=true, nextI after all children.
 *   If it fails (children sum != v): returns isGroup=false, nextI=i+1.
 */

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const EPSILON = 0.5;

const filePath = path.join(__dirname, "../ShablonSotuv.xlsx");
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true, raw: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const allRows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: null,
  raw: true,
  blankrows: true,
});

const BRANCH_SALES_COLS = [
  { name: "Market MEGA market", col: 4 },
  { name: "Маркет GoldMart", col: 12 },
  { name: "Маркет OILA market", col: 20 },
  { name: "Маркет Uchquduq SmartCity", col: 28 },
];

const dataRows = [];
for (let i = 8; i < allRows.length; i++) {
  const r = allRows[i];
  if (!r) continue;
  if (typeof r[0] !== "number" || typeof r[1] !== "string") continue;
  const salesPerBranch = {};
  for (const b of BRANCH_SALES_COLS) {
    salesPerBranch[b.name] = typeof r[b.col] === "number" ? r[b.col] : 0;
  }
  dataRows.push({ code: r[0], name: r[1].trim(), sales: salesPerBranch });
}

console.log(`Total rows with numeric code: ${dataRows.length}`);

const root = dataRows[0];
console.log(`Root: code=${root.code} name="${root.name}"`);
for (const b of BRANCH_SALES_COLS) {
  console.log(`  ${b.name}: ${root.sales[b.name].toFixed(2)}`);
}

/**
 * Memoized result for consumeOne per (index, branchName).
 * Avoids redundant re-computation when same index is tried by different parent candidates.
 *
 * In practice, each row is consumed exactly once (by its real parent), so the memo
 * is mostly for safety and doesn't hurt O(n) amortized complexity.
 */

/**
 * Iterative, linear implementation using a real stack.
 *
 * State machine per stack entry:
 *   { row, v, childrenSum, leaves, groupCount, isRoot }
 *
 * Process:
 *   Push MARKET (root) as first stack entry.
 *   For each subsequent row R:
 *     v = R.v
 *     Add R to top of stack as a potential group parent.
 *     After adding, check if top.childrenSum == top.v (group closed).
 *     The key: when we push R, we subtract R.v from R's parent's PENDING AMOUNT.
 *     But R might itself be a group, so we don't know R's contribution until R is closed.
 *
 * This is the standard "operator precedence / reduce" mechanism:
 *
 * Use an operand stack for "completed subtrees" and a "pending" stack for open groups:
 *
 * pending: stack of { code, name, v, accumulated }
 *   (groups waiting for their children)
 *
 * For each row R (v = sales value):
 *   pending.push({ ...R, accumulated: 0 })
 *   Then greedily reduce:
 *     while pending.length >= 2:
 *       let child = pending[pending.length - 1]
 *       let parent = pending[pending.length - 2]
 *       parent.accumulated += child.v
 *       if abs(parent.accumulated - parent.v) < EPSILON:
 *         # parent is now CLOSED (all children summed to parent.v)
 *         parent.isGroup = true
 *         pending.pop() # remove child (child already contributed its .v)
 *         pending.pop() # remove parent
 *         # create a "completed group token" with value = parent.v
 *         # push this token as a new pending entry
 *         pending.push({ ...parent, isGroup: true, accumulated: 0 })
 *         # Continue trying to close grandparent
 *       elif parent.accumulated > parent.v + EPSILON:
 *         # parent is a LEAF (accumulated > its own value means it can't be a group)
 *         # But this shouldn't happen in a well-formed report...
 *         break
 *       else:
 *         break  # parent still waiting for more children
 *
 * PROBLEM: When we push R and immediately try to close the parent,
 * we don't know if R is a leaf or group yet. If R is a GROUP,
 * R's contribution to parent = R.v (the GROUP total). This is correct.
 * If R is a LEAF, R's contribution = R.v. Also correct.
 * Either way, R contributes R.v to its parent.
 *
 * But the "pending" stack has BOTH "incomplete groups" (waiting for children)
 * and "completed atoms" (leaves OR closed groups). When we push R, then try to
 * reduce parent: parent.accumulated += R.v. But this is WRONG because R hasn't
 * been finalized yet (we don't know if R will collect more children or not).
 *
 * ACTUALLY this IS correct if we think of it this way:
 * When R is pushed, it represents "this row's contribution to its parent = R.v".
 * Regardless of whether R ends up being a group or leaf, it contributes R.v upward.
 * Then R itself starts accumulating children.
 * When R's accumulated children sum == R.v, R is closed as a GROUP.
 * When R gets "eaten" by a grandparent closing, it's just a contribution.
 *
 * REDUCTION RULE (try after each push):
 * while pending.length >= 2:
 *   topmost = pending.top
 *   second = pending[top-1]
 *   second.accumulated += topmost.v  # topmost contributes to second
 *   if abs(second.accumulated - second.v) < EPSILON:
 *     second is CLOSED as GROUP
 *     pending.pop() # topmost was last child
 *     pending.pop() # second was the group
 *     push closed-second (now a completed token with v=second.v)
 *     continue reducing
 *   elif second.accumulated > second.v + EPSILON:
 *     second is a LEAF (it received too much — can't be a group)
 *     # Undo the addition: second.accumulated -= topmost.v
 *     # Keep both on stack, break
 *     second.accumulated -= topmost.v  # undo
 *     break
 *   else:
 *     break # second still waiting
 *
 * Wait — this reduction is WRONG because we should only reduce when second is CLOSED,
 * not try to close second every time we push topmost. The issue: we don't know when
 * second's children are done — we just know topmost.v has been pushed.
 *
 * When second.accumulated == second.v: second is done.
 * When second.accumulated < second.v: still waiting for more.
 * When second.accumulated > second.v: second is a leaf (shouldn't have children).
 *
 * But we already added topmost.v to second.accumulated. If that made it overshoot,
 * we need to undo. But then where does topmost go? Topmost should contribute to
 * second's PARENT instead.
 *
 * THIS IS EXACTLY the problem. The solution: don't try to add topmost to second
 * until second is definitely closed. But we don't know when second is closed
 * until we've pushed enough children.
 *
 * === ACTUAL WORKING SOLUTION ===
 *
 * The algorithm in the user's specification is clear:
 *   "lookahead: i-qator uchun j=i+1 dan boshlab Продажи'ni yig', agar yig'indi == v[i] bo'lsa
 *    → i GROUP, i+1..j uning bolalari (ichida rekursiya), i=j+1."
 *
 * This IS the correct recursive descent. The issue was performance with slicing.
 * The fix: use indices instead of slices. Each level passes (start, end) bounds.
 *
 * And the lookahead at each level sums ONLY the DIRECT children's values.
 * "DIRECT" means: we consume one child at a time, where each child may itself
 * be a group (taking up multiple rows). We advance the index correctly.
 *
 * This requires: to consume one child, we need to know if it's a group or leaf.
 * We determine this by lookahead within the child's lookahead range.
 * This is inherently O(n * depth) but with bounded depth (1C typically 5-8 levels) = O(n).
 */

/**
 * Returns { isGroup, consumed, leaves, groupCount }
 * consumed = number of rows starting at `start` that were part of this subtree
 * (including the row at `start` itself).
 */
function consumeNode(arr, start, branchName) {
  if (start >= arr.length) return null;
  const row = arr[start];
  const v = row.sales[branchName] ?? 0;

  if (v === 0) {
    return {
      isGroup: false,
      consumed: 1,
      leaves: [row],
      groupCount: 0,
    };
  }

  // Try to find children: advance from start+1, consuming child nodes,
  // until accumulated sum of child values == v.
  const childLeaves = [];
  let childGroupCount = 0;
  let accSum = 0;
  let j = start + 1;

  while (j < arr.length && accSum < v - EPSILON) {
    const childResult = consumeNode(arr, j, branchName);
    if (!childResult) break;
    childLeaves.push(...childResult.leaves);
    childGroupCount += childResult.groupCount;
    if (!childResult.isGroup) {
      accSum += childResult.leaves[0]?.sales[branchName] ?? 0;
    } else {
      // Group: its value was the v of the group's row
      accSum += arr[j].sales[branchName] ?? 0;
    }
    j += childResult.consumed;

    if (accSum > v + EPSILON) {
      // Overshot: this row is NOT a group at this level. Treat as leaf.
      return {
        isGroup: false,
        consumed: 1,
        leaves: [row],
        groupCount: 0,
      };
    }
  }

  if (Math.abs(accSum - v) < EPSILON && j > start + 1) {
    // Row at `start` is a GROUP with children from [start+1..j-1]
    return {
      isGroup: true,
      consumed: j - start,
      leaves: childLeaves,
      groupCount: childGroupCount + 1,
    };
  }

  // Could not find children summing to v: this row is a LEAF
  return {
    isGroup: false,
    consumed: 1,
    leaves: [row],
    groupCount: 0,
  };
}

function parseAllLeaves(rows, branchName) {
  const leaves = [];
  let groupCount = 0;

  // rows[0] is MARKET root — it's the top-level group
  let i = 1; // skip MARKET
  const end = rows.length;

  while (i < end) {
    const result = consumeNode(rows, i, branchName);
    if (!result) break;
    leaves.push(...result.leaves);
    groupCount += result.groupCount;
    i += result.consumed;
  }

  return { leaves, groupCount };
}

console.log("\n=== Validation per branch ===");
let allOk = true;

for (const b of BRANCH_SALES_COLS) {
  const result = parseAllLeaves(dataRows, b.name);

  const leafSum = result.leaves.reduce(
    (s, l) => s + (l.sales[b.name] ?? 0),
    0
  );
  const marketTotal = root.sales[b.name];
  const diff = Math.abs(leafSum - marketTotal);
  const ok = diff < EPSILON;
  if (!ok) allOk = false;

  console.log(`\n${b.name}:`);
  console.log(`  Groups identified: ${result.groupCount}`);
  console.log(`  Leaves (SKU) identified: ${result.leaves.length}`);
  console.log(`  Non-zero leaves: ${result.leaves.filter(l => l.sales[b.name] > 0).length}`);
  console.log(`  Leaf sum: ${leafSum.toFixed(2)}`);
  console.log(`  MARKET total: ${marketTotal.toFixed(2)}`);
  console.log(`  Difference: ${diff.toFixed(4)}`);
  console.log(`  Invariant: ${ok ? "PASS ✓" : "FAIL ✗"}`);
}

console.log(`\n=== Overall: ${allOk ? "ALL PASS ✓" : "SOME FAILED ✗"} ===`);
