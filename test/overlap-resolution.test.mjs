// Overlap resolution was rewritten from a pairwise scan to a running maximum, for speed.
// That is exactly the kind of change that quietly alters which marks a user sees, so this
// file pins the two implementations together: the old one is reproduced verbatim below and
// the new one must agree with it on every generated case, not merely on the fixtures.
//
// It also pins the properties the rewrite relies on, so a future change that breaks one of
// them fails here with a name rather than as a mysterious diff.
import assert from "node:assert";
import { analyze } from "../src/core/ruleEngine.mjs";

const RULE_RANK = {
	doubled: 70,
	deslop: 60,
	cliche: 50,
	passive: 40,
	hedge: 30,
	weasel: 25,
	adverb: 10,
};

/** The implementation that shipped in 1.0.2, kept only as the oracle for this test. */
function resolveOverlapsPairwise(marks) {
	const layered = marks.filter((mark) => mark.rule !== "longSentence");
	if (layered.length < 2) return marks;

	const ordered = [...layered].sort(
		(a, b) =>
			b.to - b.from - (a.to - a.from) ||
			a.from - b.from ||
			(RULE_RANK[b.rule] ?? 0) - (RULE_RANK[a.rule] ?? 0)
	);

	const kept = [];
	const dropped = new Set();
	for (const mark of ordered) {
		if (mark.rule === "doubled") {
			kept.push(mark);
			continue;
		}
		const swallowed = kept.some(
			(other) =>
				other.rule !== "doubled" &&
				other.from <= mark.from &&
				other.to >= mark.to &&
				!(other.from === mark.from && other.to === mark.to && other === mark)
		);
		if (swallowed) dropped.add(mark);
		else kept.push(mark);
	}

	return marks.filter((mark) => !dropped.has(mark));
}

/** The sweep that replaced it. Must be kept in step with ruleEngine.mjs. */
function resolveOverlapsSweep(marks) {
	const layered = marks.filter((mark) => mark.rule !== "longSentence");
	if (layered.length < 2) return marks;

	const ordered = [...layered].sort(
		(a, b) =>
			a.from - b.from || b.to - a.to || (RULE_RANK[b.rule] ?? 0) - (RULE_RANK[a.rule] ?? 0)
	);

	const dropped = new Set();
	let furthest = -1;
	for (const mark of ordered) {
		if (mark.rule === "doubled") continue;
		if (mark.to <= furthest) dropped.add(mark);
		else furthest = mark.to;
	}

	return marks.filter((mark) => !dropped.has(mark));
}

// --- the two implementations must agree, on adversarial shapes -----------------------------------
//
// A deterministic generator, so a failure is reproducible from the seed printed below rather
// than being a coin flip in CI. Spans are drawn from a small coordinate space on purpose:
// that is what forces the interesting cases — exact duplicates, shared start offsets, shared
// end offsets, and deep nesting — to appear often instead of once in a million trials.
{
	const RULES = ["adverb", "passive", "hedge", "weasel", "doubled", "cliche", "deslop", "longSentence"];
	let seed = 0x2f6e2b1;
	const random = (n) => {
		// xorshift32 — no Math.random, so this test is reproducible.
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		seed >>>= 0;
		return seed % n;
	};

	for (let trial = 0; trial < 4000; trial++) {
		const span = 1 + random(14);
		const count = random(12);
		const marks = [];
		for (let i = 0; i < count; i++) {
			const from = random(span);
			const to = from + random(span - from + 1);
			marks.push({ from, to, rule: RULES[random(RULES.length)], severity: "info", message: "m" });
		}

		const expected = resolveOverlapsPairwise(marks);
		const actual = resolveOverlapsSweep(marks);
		assert.deepEqual(
			actual,
			expected,
			`trial ${trial}: the sweep and the pairwise scan disagree on ${JSON.stringify(marks)}`
		);
	}
}

// --- the properties the sweep depends on ---------------------------------------------------------
{
	// Containment is transitive, which is what makes it safe to fold a dropped mark's reach
	// into the running maximum instead of tracking only surviving marks.
	const a = { from: 0, to: 30, rule: "cliche", severity: "info", message: "a" };
	const b = { from: 5, to: 20, rule: "hedge", severity: "info", message: "b" };
	const c = { from: 8, to: 12, rule: "adverb", severity: "info", message: "c" };
	const kept = resolveOverlapsSweep([a, b, c]);
	assert.deepEqual(kept, [a], "the outermost container swallows the whole chain");
	assert.deepEqual(kept, resolveOverlapsPairwise([a, b, c]));
}
{
	// A long sentence is a different layer. It contains almost everything by definition and
	// must never suppress anything.
	const long = { from: 0, to: 100, rule: "longSentence", severity: "warn", message: "long" };
	const adverb = { from: 10, to: 16, rule: "adverb", severity: "info", message: "adv" };
	assert.deepEqual(resolveOverlapsSweep([long, adverb]), [long, adverb]);
}
{
	// A doubled word survives being contained, and never swallows what it contains.
	const cliche = { from: 0, to: 20, rule: "cliche", severity: "info", message: "c" };
	const doubled = { from: 4, to: 11, rule: "doubled", severity: "warn", message: "d" };
	assert.deepEqual(resolveOverlapsSweep([cliche, doubled]), [cliche, doubled]);

	const wide = { from: 0, to: 30, rule: "doubled", severity: "warn", message: "wide" };
	const inner = { from: 5, to: 9, rule: "adverb", severity: "info", message: "i" };
	assert.deepEqual(
		resolveOverlapsSweep([wide, inner]),
		[wide, inner],
		"a doubled mark must not suppress the marks it happens to span"
	);
}
{
	// Input order is preserved: the panel and the decorations both rely on it.
	const marks = [
		{ from: 40, to: 44, rule: "adverb", severity: "info", message: "z" },
		{ from: 0, to: 10, rule: "cliche", severity: "info", message: "a" },
	];
	assert.deepEqual(resolveOverlapsSweep(marks), marks);
}

// --- and the shipped engine still behaves ---------------------------------------------------------
{
	// "at the end of the day" is a cliche containing the adverb-shaped nothing, and
	// "not just X, it's Y" is a de-slop reframe containing the hedge "just". Whatever else
	// changes, one stretch of prose must not carry two competing underlines.
	const analysis = analyze("At the end of the day, it is not just careless, it's actually wrong.", {
		isPro: true,
	});
	const overlapping = analysis.marks.filter(
		(mark) =>
			mark.rule !== "longSentence" &&
			mark.rule !== "doubled" &&
			analysis.marks.some(
				(other) =>
					other !== mark &&
					other.rule !== "longSentence" &&
					other.rule !== "doubled" &&
					other.from <= mark.from &&
					other.to >= mark.to
			)
	);
	assert.deepEqual(overlapping, [], "no surviving mark may be contained by another");
}

console.log("ok  overlap-resolution.test.mjs");
