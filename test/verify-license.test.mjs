// Exercises the vendored verifier with an EPHEMERAL keypair, so it runs on a fresh clone
// and in CI with no signing key present. Covers the whole rejection surface: a forged
// signature, a wrong product, garbage base64, and an empty key must every one of them
// fail closed.
import assert from "node:assert";
import nacl from "tweetnacl";
import { verifyLicense } from "../src/shared/verifyLicense.mjs";

const toBase64 = (bytes) =>
	Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const pair = nacl.sign.keyPair();
const publicKey = Buffer.from(pair.publicKey).toString("base64");

function mint(payload, secretKey = pair.secretKey) {
	const bytes = new TextEncoder().encode(JSON.stringify(payload));
	return `${toBase64(bytes)}.${toBase64(nacl.sign.detached(bytes, secretKey))}`;
}

const good = mint({ product: "prose-lens", email: "a@b.com", issued: "2026-01-01T00:00:00.000Z" });
assert.deepEqual(verifyLicense(good, "prose-lens", publicKey), { valid: true, email: "a@b.com" });

// Surrounding whitespace is a pasting artifact, not a forgery.
assert.equal(verifyLicense(`  ${good}\n`, "prose-lens", publicKey).valid, true);

// Wrong product.
assert.equal(verifyLicense(good, "vault-triage", publicKey).valid, false);

// Forged signature: a valid payload with 64 zero bytes appended as the signature.
const payloadPart = good.split(".")[0];
const forged = `${payloadPart}.${toBase64(new Uint8Array(64))}`;
assert.equal(verifyLicense(forged, "prose-lens", publicKey).valid, false);

// A key minted by a DIFFERENT keypair must not verify against our public key.
const attacker = nacl.sign.keyPair();
const wrongSigner = mint({ product: "prose-lens", email: "a@b.com", issued: "x" }, attacker.secretKey);
assert.equal(verifyLicense(wrongSigner, "prose-lens", publicKey).valid, false);

// Malformed input must fail closed, never throw.
for (const bad of ["", "   ", "not-a-key", "###.###", "a.b.c", null, undefined]) {
	const result = verifyLicense(bad, "prose-lens", publicKey);
	assert.equal(result.valid, false, `expected ${JSON.stringify(bad)} to be rejected`);
	assert.ok(result.error, "a rejection must carry a reason");
}

console.log("ok  verify-license.test.mjs");
