// What `data.json` is allowed to do to the plugin.
//
// The bug this file exists to prevent is silent and total: `Object.assign` only skips ABSENT
// keys, so an explicit null or a string where a number belongs lands straight on top of the
// default. A data.json carrying `"maxNoteChars": null` makes `doc.length > null` true for
// every non-empty note, so analysis is skipped on everything, forever, with no error anywhere
// and no way for a user to work out why. The only recourse is deleting a file they do not know
// exists.
import assert from "node:assert";
import { BOUNDS, DEFAULT_SETTINGS, SCHEMA_VERSION, normalizeSettings } from "../src/settings";

// --- nothing at all is the same as the defaults --------------------------------------------------
{
	for (const empty of [undefined, null, {}]) {
		const settings = normalizeSettings(empty);
		assert.deepEqual(settings, { ...DEFAULT_SETTINGS, schemaVersion: SCHEMA_VERSION });
	}
}

// --- the failure that shipped: a null number must not survive ------------------------------------
{
	const settings = normalizeSettings({ maxNoteChars: null });
	assert.equal(settings.maxNoteChars, DEFAULT_SETTINGS.maxNoteChars);
	// The specific consequence, spelled out: the guard must not be satisfied by every note.
	assert.ok(1 > (null as unknown as number), "the comparison that made this fatal still holds");
	assert.ok(!(1 > settings.maxNoteChars), "and the repaired value no longer skips every note");
}

// --- every non-number is rejected, every legal number is kept ------------------------------------
{
	for (const junk of [null, undefined, NaN, Infinity, -Infinity, "300000", {}, [], true]) {
		const settings = normalizeSettings({
			longSentenceWords: junk,
			veryLongSentenceWords: junk,
			maxNoteChars: junk,
		});
		assert.equal(settings.longSentenceWords, DEFAULT_SETTINGS.longSentenceWords, String(junk));
		assert.equal(settings.maxNoteChars, DEFAULT_SETTINGS.maxNoteChars, String(junk));
		assert.ok(Number.isFinite(settings.veryLongSentenceWords));
	}

	const kept = normalizeSettings({ longSentenceWords: 30, veryLongSentenceWords: 50 });
	assert.equal(kept.longSentenceWords, 30, "a legal value is left alone");
	assert.equal(kept.veryLongSentenceWords, 50);
}

// --- out-of-range numbers are clamped, not discarded ---------------------------------------------
//
// Clamping rather than falling back matters for maxNoteChars specifically: a value stored under
// the old one-million ceiling is pulled down to something this machine can analyze between
// keystrokes, instead of being honoured and freezing the editor for ~2.4 seconds per pause.
{
	assert.equal(normalizeSettings({ maxNoteChars: 1_000_000 }).maxNoteChars, BOUNDS.maxNoteChars.max);
	assert.equal(normalizeSettings({ maxNoteChars: -5 }).maxNoteChars, BOUNDS.maxNoteChars.min);
	assert.equal(normalizeSettings({ longSentenceWords: 9999 }).longSentenceWords, BOUNDS.longSentenceWords.max);
	assert.equal(normalizeSettings({ longSentenceWords: 12.6 }).longSentenceWords, BOUNDS.longSentenceWords.min);
}

// --- the two sentence thresholds are a pair and may not cross ------------------------------------
{
	const crossed = normalizeSettings({ longSentenceWords: 40, veryLongSentenceWords: 20 });
	assert.ok(
		crossed.veryLongSentenceWords > crossed.longSentenceWords,
		"a crossed pair would mark every long sentence as a very long one"
	);
}

// --- entitlement is the one field where only an explicit true counts -----------------------------
{
	for (const truthy of ["true", 1, {}, [], "yes"]) {
		assert.equal(normalizeSettings({ isPro: truthy }).isPro, false, String(truthy));
	}
	assert.equal(normalizeSettings({ isPro: true }).isPro, true);
	// And the prototype route stays shut.
	const hostile = JSON.parse('{"__proto__": {"isPro": true}}') as unknown;
	assert.equal(normalizeSettings(hostile).isPro, false);
	assert.equal(({} as { isPro?: boolean }).isPro, undefined, "no prototype was polluted");
}

// --- booleans, strings and arrays ----------------------------------------------------------------
{
	const settings = normalizeSettings({
		marksEnabled: "no",
		sentenceHeat: 1,
		showStatusBar: null,
		hideProSections: "yes",
		licenseKey: 42,
		licenseEmail: null,
		ignoredWords: ["ok", 7, null, "fine"],
		mutedPaths: "not an array",
	});
	assert.equal(settings.marksEnabled, DEFAULT_SETTINGS.marksEnabled);
	assert.equal(settings.sentenceHeat, DEFAULT_SETTINGS.sentenceHeat);
	assert.equal(settings.showStatusBar, DEFAULT_SETTINGS.showStatusBar);
	assert.equal(settings.hideProSections, false);
	assert.equal(settings.licenseKey, "");
	assert.equal(settings.licenseEmail, "");
	assert.deepEqual(settings.ignoredWords, ["ok", "fine"], "non-strings are dropped, not coerced");
	assert.deepEqual(settings.mutedPaths, []);
}

// --- rules: known ids coerced, unknown ids dropped ------------------------------------------------
{
	const settings = normalizeSettings({
		rules: { adverb: false, passive: "no", notARule: true },
	});
	assert.equal(settings.rules.adverb, false, "an explicit false is honoured");
	assert.equal(settings.rules.passive, true, "a non-boolean falls back to the default");
	assert.ok(!("notARule" in settings.rules), "a rule id that no longer exists is not kept");
	for (const id of Object.keys(DEFAULT_SETTINGS.rules)) {
		assert.equal(typeof settings.rules[id], "boolean", `${id} must be a boolean`);
	}
}

// --- normalization is idempotent, which is what makes it safe to run unconditionally --------------
{
	const once = normalizeSettings({ maxNoteChars: 1_000_000, isPro: true, longSentenceWords: 9999 });
	const twice = normalizeSettings(once);
	assert.deepEqual(twice, once);
	assert.equal(twice.schemaVersion, SCHEMA_VERSION);
}

console.log("ok  settings-normalize.test.ts");
