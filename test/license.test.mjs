// The committed fixture must NEVER be a working key for the real product.
//
// This file used to hold a real, production-signed `prose-lens` license, minted with the
// real private key and verifying against the public key that ships inside the plugin.
// The repo is public. Anyone could have copied that string out of git and had Pro forever.
// A security review caught it; the keypair was rotated (killing the leaked token) and the
// fixture re-minted under a product id the plugin never asks for.
//
// The fixture still does its real job — proving that publicKey.ts pairs with the private
// key that signs customer licenses, so the public key can never be swapped without this
// test going red — but it unlocks nothing.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyLicense } from "../src/shared/verifyLicense.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = fs.readFileSync(path.join(root, "test/fixtures/test-license.key"), "utf8").trim();

const source = fs.readFileSync(path.join(root, "src/license/publicKey.ts"), "utf8");
const match = /LICENSE_PUBLIC_KEY\s*=\s*"([^"]+)"/.exec(source);
assert.ok(match, "src/license/publicKey.ts must export LICENSE_PUBLIC_KEY as a string literal");
const publicKey = match[1];

// The product id the plugin actually asks for. Read from the source so a rename can't
// silently make the fixture live again.
const productSource = fs.readFileSync(path.join(root, "src/product.ts"), "utf8");
const productMatch = /PRODUCT_ID\s*=\s*"([^"]+)"/.exec(productSource);
assert.ok(productMatch, "src/product.ts must export PRODUCT_ID as a string literal");
const PRODUCT_ID = productMatch[1];

// THE ONE THAT MATTERS: the committed key must not unlock the shipped product.
const againstReal = verifyLicense(key, PRODUCT_ID, publicKey);
assert.equal(
	againstReal.valid,
	false,
	`SECURITY: the committed fixture is a WORKING ${PRODUCT_ID} license. Anyone can copy it ` +
		`out of the public repo and unlock Pro. Re-mint it under a product id the plugin never requests.`
);
assert.match(againstReal.error ?? "", /different product/i);

// ...while still proving the bundled public key pairs with the signing key. If the keypair
// is ever rotated without re-minting this fixture, this line goes red — which is the whole
// point: a silent public-key swap would revoke Pro for every paying customer.
const againstTest = verifyLicense(key, "prose-lens-test", publicKey);
assert.equal(
	againstTest.valid,
	true,
	`the bundled public key must verify the fixture: ${againstTest.error ?? ""}`
);
assert.equal(againstTest.email, "test@example.com");

console.log("ok  license.test.mjs");
