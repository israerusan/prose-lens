// The bundled public key must verify a REAL key minted with the real private key, and
// must reject a key minted for a different product. This is the guard against ever
// swapping the public key without re-minting — which would silently revoke Pro for
// every paying customer.
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

const valid = verifyLicense(key, "prose-lens", publicKey);
assert.equal(valid.valid, true, `the bundled public key must verify the fixture license: ${valid.error ?? ""}`);
assert.equal(valid.email, "test@example.com");

// A key is bound to its product. A Vault Spotlight key must never unlock this.
const crossProduct = verifyLicense(key, "vault-spotlight", publicKey);
assert.equal(crossProduct.valid, false);
assert.match(crossProduct.error ?? "", /different product/i);

console.log("ok  license.test.mjs");
