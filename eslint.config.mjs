import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [...nextVitals, ...nextTs, { ignores: ['.next/**', 'vendor/**', 'dev-skills/**', 'design/**', 'scripts/visual/**', 'anfitria/**', 'anfitria-next/**', 'blemia/**', 'src/lib/skills/generated.ts'] }];
export default config;
