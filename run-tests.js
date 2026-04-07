const { execSync } = require('child_process');
try {
  const result = execSync(
    'npx vitest run tests/tunnel-manager.test.ts tests/fleet-db-tunnel.test.ts tests/ollama-url.test.ts',
    { encoding: 'utf-8', timeout: 60000, stdio: 'inherit' }
  );
} catch (e) {
  process.exit(e.status || 1);
}
