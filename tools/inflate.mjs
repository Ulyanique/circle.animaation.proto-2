import { inflate } from '@sparticuz/chromium';
import { join } from 'node:path';
const r = await inflate(join('/tmp/tools/node_modules/@sparticuz/chromium/bin', 'al2023.tar.br'));
console.log('inflated to', r);
