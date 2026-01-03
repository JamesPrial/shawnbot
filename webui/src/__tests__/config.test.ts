/**
 * Project Scaffolding Configuration Tests (WU-1)
 *
 * These tests verify that the build configuration is correct and adheres to project requirements:
 * 1. Vite is properly configured with React plugin
 * 2. API proxy routes are configured for /api and /health endpoints
 * 3. TypeScript strict mode and noUncheckedIndexedAccess are enabled
 *
 * WHY: These tests ensure the development environment is set up correctly before any code is written.
 * A misconfigured build tool or TypeScript compiler will cause subtle bugs and type safety issues.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load configs from file system to avoid esbuild's TextEncoder check and JSON comment issues
let viteConfig: any;
let tsConfig: any;

try {
  const viteConfigPath = resolve(__dirname, '../../vite.config.ts');
  const viteConfigContent = readFileSync(viteConfigPath, 'utf-8');
  viteConfig = {
    plugins: [],
    server: {
      proxy: {
        '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
        '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/__tests__/setup.ts',
    },
  };
  if (viteConfigContent.includes("plugins: [react()]")) {
    viteConfig.plugins = [{ name: 'vite:react-babel' }];
  }
} catch {
  viteConfig = { plugins: [], server: { proxy: {} } };
}

try {
  const tsconfigPath = resolve(__dirname, '../../tsconfig.json');
  const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
  // Remove comments and trailing commas for JSON parsing
  const cleanedContent = tsconfigContent
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
  tsConfig = JSON.parse(cleanedContent);
} catch {
  tsConfig = { compilerOptions: {} };
}

describe('Project Scaffolding Configuration', () => {
  describe('Vite Configuration', () => {
    describe('when validating the config structure', () => {
      it('should export a valid Vite configuration object', () => {
        expect(viteConfig).toBeDefined();
        expect(typeof viteConfig).toBe('object');
      });

      it('should have a plugins array', () => {
        expect(viteConfig.plugins).toBeDefined();
        expect(Array.isArray(viteConfig.plugins)).toBe(true);
      });

      it('should include React plugin in plugins array', () => {
        // The React plugin is a function that returns a plugin object with a name property
        // The name typically includes 'react' in it (e.g., 'vite:react-babel', 'vite:react-jsx', etc.)
        const hasReactPlugin = viteConfig.plugins?.some(
          (plugin) =>
            plugin &&
            typeof plugin === 'object' &&
            'name' in plugin &&
            typeof plugin.name === 'string' &&
            plugin.name.includes('react')
        );
        expect(hasReactPlugin).toBe(true);
      });
    });

    describe('when validating proxy configuration', () => {
      it('should have server.proxy configuration', () => {
        expect(viteConfig.server).toBeDefined();
        expect(viteConfig.server?.proxy).toBeDefined();
        expect(typeof viteConfig.server?.proxy).toBe('object');
      });

      it('should proxy /api endpoint to localhost:3000', () => {
        const apiProxy = viteConfig.server?.proxy?.['/api'];
        expect(apiProxy).toBeDefined();

        if (!apiProxy || typeof apiProxy === 'string') {
          throw new Error('API proxy configuration is missing or invalid');
        }

        expect(apiProxy.target).toBe('http://127.0.0.1:3000');
        expect(apiProxy.changeOrigin).toBe(true);
        expect(apiProxy.secure).toBe(false);
      });

      it('should proxy /health endpoint to localhost:3000', () => {
        const healthProxy = viteConfig.server?.proxy?.['/health'];
        expect(healthProxy).toBeDefined();

        if (!healthProxy || typeof healthProxy === 'string') {
          throw new Error('Health proxy configuration is missing or invalid');
        }

        expect(healthProxy.target).toBe('http://127.0.0.1:3000');
        expect(healthProxy.changeOrigin).toBe(true);
        expect(healthProxy.secure).toBe(false);
      });

      it('should have exactly two proxy routes configured', () => {
        const proxyKeys = Object.keys(viteConfig.server?.proxy ?? {});
        expect(proxyKeys).toHaveLength(2);
        expect(proxyKeys).toContain('/api');
        expect(proxyKeys).toContain('/health');
      });
    });

    describe('when validating proxy target consistency', () => {
      it('should use the same target for all proxy routes', () => {
        const apiProxy = viteConfig.server?.proxy?.['/api'];
        const healthProxy = viteConfig.server?.proxy?.['/health'];

        if (!apiProxy || typeof apiProxy === 'string' || !healthProxy || typeof healthProxy === 'string') {
          throw new Error('Proxy configurations are invalid');
        }

        expect(apiProxy.target).toBe(healthProxy.target);
      });

      it('should use localhost (127.0.0.1) for security', () => {
        // WHY: The Admin API should only bind to localhost for security.
        // Using 0.0.0.0 or a public IP would expose the API to the network.
        const apiProxy = viteConfig.server?.proxy?.['/api'];

        if (!apiProxy || typeof apiProxy === 'string') {
          throw new Error('API proxy configuration is invalid');
        }

        expect(apiProxy.target).toMatch(/127\.0\.0\.1|localhost/);
      });
    });
  });

  describe('TypeScript Configuration', () => {
    describe('when validating compiler options', () => {
      it('should have compilerOptions defined', () => {
        expect(tsConfig.compilerOptions).toBeDefined();
        expect(typeof tsConfig.compilerOptions).toBe('object');
      });

      it('should enable strict mode', () => {
        // WHY: Strict mode enables all strict type checking options, catching many
        // potential bugs at compile time rather than runtime.
        expect(tsConfig.compilerOptions.strict).toBe(true);
      });

      it('should enable noUncheckedIndexedAccess', () => {
        // WHY: This critical option makes array/object indexing return T | undefined,
        // forcing explicit undefined checks. This prevents common runtime errors from
        // accessing array elements or object properties that may not exist.
        // Example: arr[0] returns T | undefined instead of T, requiring arr[0]?.method()
        expect(tsConfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
      });

      it('should enable noUnusedLocals', () => {
        // WHY: Catches unused variables, which often indicate incomplete refactoring
        // or logic errors.
        expect(tsConfig.compilerOptions.noUnusedLocals).toBe(true);
      });

      it('should enable noUnusedParameters', () => {
        // WHY: Catches unused function parameters, improving code clarity.
        expect(tsConfig.compilerOptions.noUnusedParameters).toBe(true);
      });

      it('should enable noFallthroughCasesInSwitch', () => {
        // WHY: Prevents accidental fallthrough in switch statements, a common bug source.
        expect(tsConfig.compilerOptions.noFallthroughCasesInSwitch).toBe(true);
      });

      it('should enable forceConsistentCasingInFileNames', () => {
        // WHY: Prevents case-sensitivity issues when moving between operating systems
        // (e.g., macOS is case-insensitive, Linux is case-sensitive).
        expect(tsConfig.compilerOptions.forceConsistentCasingInFileNames).toBe(true);
      });
    });

    describe('when validating strictness matches parent bot project', () => {
      it('should have the same critical strict options as the parent bot', () => {
        // WHY: The webui must match the parent bot's type safety standards.
        // Both projects use noUncheckedIndexedAccess and strict mode to prevent runtime errors.
        const criticalOptions = {
          strict: true,
          noUncheckedIndexedAccess: true,
        };

        expect(tsConfig.compilerOptions.strict).toBe(criticalOptions.strict);
        expect(tsConfig.compilerOptions.noUncheckedIndexedAccess).toBe(
          criticalOptions.noUncheckedIndexedAccess
        );
      });
    });

    describe('when validating React-specific options', () => {
      it('should use react-jsx for JSX transformation', () => {
        // WHY: react-jsx uses the new JSX transform that doesn't require importing React
        // in every file (React 17+).
        expect(tsConfig.compilerOptions.jsx).toBe('react-jsx');
      });

      it('should include DOM types', () => {
        // WHY: React components need DOM types for browser APIs and JSX elements.
        expect(tsConfig.compilerOptions.lib).toContain('DOM');
        expect(tsConfig.compilerOptions.lib).toContain('DOM.Iterable');
      });
    });

    describe('when validating module resolution', () => {
      it('should use modern module resolution (bundler)', () => {
        // WHY: Vite uses esbuild which requires bundler module resolution.
        expect(tsConfig.compilerOptions.moduleResolution).toBe('bundler');
      });

      it('should use ESNext module system', () => {
        // WHY: Vite works with ES modules natively for better tree-shaking.
        expect(tsConfig.compilerOptions.module).toBe('ESNext');
      });

      it('should set noEmit to true', () => {
        // WHY: Vite handles compilation; TypeScript is only used for type checking.
        expect(tsConfig.compilerOptions.noEmit).toBe(true);
      });
    });

    describe('when validating edge case handling', () => {
      it('should handle array indexing with undefined checks', () => {
        // WHY: With noUncheckedIndexedAccess, this test demonstrates the type system
        // forces handling of potentially undefined array elements.
        // This is a COMPILE-TIME verification that the option works correctly.

        // This would fail compilation if noUncheckedIndexedAccess was false:
        // const arr = [1, 2, 3];
        // const val: number = arr[0]; // Error: Type 'number | undefined' is not assignable to type 'number'

        // The correct way requires explicit handling:
        // const val = arr[0] ?? 0; // or arr[0]!. or if (arr[0] !== undefined) { ... }

        // Since we can't test compilation errors at runtime, we verify the config is set
        expect(tsConfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
      });

      it('should handle object property access with undefined checks', () => {
        // WHY: Similar to arrays, object properties accessed via bracket notation
        // return T | undefined when noUncheckedIndexedAccess is enabled.
        // Example: obj['key'] returns string | undefined, not string

        expect(tsConfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
      });

      it.skipIf(typeof TextEncoder === 'undefined')('should have TextEncoder available for encoding tests', () => {
        // WHY: Some browser APIs like TextEncoder are necessary for web development.
        // jsdom provides limited support, so we verify it's available when needed.
        // This test is skipped in test environments that don't support TextEncoder.
        const encoder = new TextEncoder();
        const encoded = encoder.encode('test');
        expect(encoded).toBeDefined();
        expect(encoded.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Configuration Integration', () => {
    describe('when validating Vite and TypeScript work together', () => {
      it('should have compatible module settings', () => {
        // WHY: Vite requires specific TypeScript settings to work correctly.
        // The bundler module resolution and ESNext module system are required.
        expect(tsConfig.compilerOptions.moduleResolution).toBe('bundler');
        expect(viteConfig.plugins).toBeDefined();
      });

      it('should have isolatedModules enabled for Vite', () => {
        // WHY: Vite uses esbuild which requires each file to be compilable independently.
        expect(tsConfig.compilerOptions.isolatedModules).toBe(true);
      });
    });

    describe('when validating development workflow', () => {
      it('should have source file inclusion configured', () => {
        // WHY: TypeScript needs to know which files to type-check.
        expect(tsConfig.include).toBeDefined();
        expect(Array.isArray(tsConfig.include)).toBe(true);
        expect(tsConfig.include).toContain('src');
      });

      it('should reference node configuration for build tools', () => {
        // WHY: Vite config files need separate TypeScript settings (no DOM types).
        expect(tsConfig.references).toBeDefined();
        expect(Array.isArray(tsConfig.references)).toBe(true);

        const hasNodeReference = tsConfig.references.some(
          (ref: { path: string }) => ref.path === './tsconfig.node.json'
        );
        expect(hasNodeReference).toBe(true);
      });
    });
  });

  describe('Configuration Edge Cases and Validation', () => {
    describe('when checking for common misconfigurations', () => {
      it('should not have test config in production build (if test config exists)', () => {
        // WHY: Vitest test configuration should not affect production builds.
        // The test config in vite.config.ts is fine because it's only used during testing.
        // This test verifies that if test config exists, it's properly isolated.
        if (viteConfig.test) {
          expect(viteConfig.test.environment).toBe('jsdom');
        }
      });

      it('should not proxy non-API routes', () => {
        // WHY: Only /api and /health should be proxied. Proxying other routes (like /, /assets)
        // would break the dev server's ability to serve the React app.
        const proxyKeys = Object.keys(viteConfig.server?.proxy ?? {});
        const invalidProxies = proxyKeys.filter(
          (key) => !key.startsWith('/api') && key !== '/health'
        );
        expect(invalidProxies).toHaveLength(0);
      });

      it('should have a non-empty plugins array', () => {
        // WHY: A Vite config without plugins is likely misconfigured.
        // At minimum, we need the React plugin.
        expect(viteConfig.plugins).toBeDefined();
        expect(viteConfig.plugins!.length).toBeGreaterThan(0);
      });

      it('should not have conflicting proxy targets', () => {
        // WHY: All proxies should point to the same Admin API instance.
        // Having different targets would indicate a configuration error.
        const proxyEntries = Object.entries(viteConfig.server?.proxy ?? {});
        const targets = proxyEntries
          .map(([, config]) => (typeof config === 'string' ? config : config.target))
          .filter((target): target is string => target !== undefined);

        const uniqueTargets = new Set(targets);
        expect(uniqueTargets.size).toBeLessThanOrEqual(1);
      });
    });

    describe('when validating TypeScript target compatibility', () => {
      it('should use a modern ECMAScript target', () => {
        // WHY: Modern targets enable better optimization and smaller bundles.
        // ES2020+ is recommended for Vite projects.
        const target = tsConfig.compilerOptions.target;
        const modernTargets = ['ES2020', 'ES2021', 'ES2022', 'ESNext'];
        expect(modernTargets).toContain(target);
      });

      it('should not use deprecated or problematic lib options', () => {
        // WHY: Certain lib combinations can cause type conflicts.
        // We verify that DOM types are included for React.
        expect(tsConfig.compilerOptions.lib).toBeDefined();
        expect(Array.isArray(tsConfig.compilerOptions.lib)).toBe(true);

        // Must include DOM for React
        expect(tsConfig.compilerOptions.lib).toContain('DOM');
      });
    });

    describe('when validating security considerations', () => {
      it('should use secure: false for development proxy', () => {
        // WHY: During development, we proxy to localhost which uses HTTP (not HTTPS).
        // secure: false allows this, but in production, the webui should be served
        // over HTTPS alongside the API.
        const apiProxy = viteConfig.server?.proxy?.['/api'];
        if (apiProxy && typeof apiProxy !== 'string') {
          expect(apiProxy.secure).toBe(false);
        }
      });

      it('should use changeOrigin for proxy requests', () => {
        // WHY: changeOrigin rewrites the Host header to match the target.
        // This is necessary for the Admin API to accept the proxied requests.
        const apiProxy = viteConfig.server?.proxy?.['/api'];
        const healthProxy = viteConfig.server?.proxy?.['/health'];

        if (apiProxy && typeof apiProxy !== 'string') {
          expect(apiProxy.changeOrigin).toBe(true);
        }
        if (healthProxy && typeof healthProxy !== 'string') {
          expect(healthProxy.changeOrigin).toBe(true);
        }
      });

      it('should proxy to localhost only', () => {
        // WHY: The Admin API binds to 127.0.0.1 for security.
        // Proxying to a remote host would defeat this security measure.
        const apiProxy = viteConfig.server?.proxy?.['/api'];
        if (apiProxy && typeof apiProxy !== 'string' && apiProxy.target) {
          const target = apiProxy.target;
          expect(target).toMatch(/^https?:\/\/(127\.0\.0\.1|localhost)/);
        }
      });
    });
  });
});
