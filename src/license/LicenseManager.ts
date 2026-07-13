import { verifyLicense, type LicenseVerification } from "../shared/verifyLicense.mjs";
import { PRODUCT_ID } from "../product";
import { LICENSE_PUBLIC_KEY } from "./publicKey";

export type { LicensePayload, LicenseVerification } from "../shared/verifyLicense.mjs";

/**
 * Thin product binding over the shared verifier (src/shared/verifyLicense.mjs,
 * vendored from obsidian-plugin-core — edit it there, not here). The product name
 * comes from product.ts so the plugin and the key-minting script can never disagree
 * about what a Prose Lens key says.
 */
export class LicenseManager {
	static verify(licenseKey: string): LicenseVerification {
		return verifyLicense(licenseKey, PRODUCT_ID, LICENSE_PUBLIC_KEY);
	}
}
