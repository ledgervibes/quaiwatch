/**
 * worker/test/ts-resolve.mjs — resolve extensionless relative imports to .ts.
 *
 * The Worker sources use extensionless specifiers (`./rpc`) because that is what
 * wrangler's bundler expects. Node's ESM resolver requires an explicit
 * extension, so this hook retries a failed relative resolution with `.ts`. It
 * exists purely so the tests can import the real Worker code with no build step
 * and no extra dependency.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && context.parentURL) {
        for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
          const url = new URL(candidate, context.parentURL);
          if (existsSync(fileURLToPath(url))) {
            return { url: url.href, shortCircuit: true };
          }
        }
      }
      throw error;
    }
  },
});
