import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/Avatar3D.tsx');
const text = fs.readFileSync(file, 'utf8');
const match = text.match(/<span>([^<]*облегчённый персонаж)<\/span>/);
assert.ok(match, '3D fallback message must remain visible in the JSX');
const message = match[1];
console.log('FALLBACK_COPY_OBSERVED', JSON.stringify(message));
assert.ok(!message.includes('не поддерживает 3D'), 'Do not claim the device lacks WebGL when the context may only be temporarily lost');
assert.ok(message.includes('3D') && message.includes('облегчённый персонаж'), 'Explain the temporary unavailable 3D fallback clearly');
console.log('FALLBACK_COPY_QA_PASS');
