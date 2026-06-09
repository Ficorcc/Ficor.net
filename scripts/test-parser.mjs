import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: null, error: 'no fm' };
  return { data: parseYaml(match[1]), error: null };
}

function parseYaml(str) {
  const lines = str.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const result = {};
  let stack = [{ obj: result, indent: -1, key: null, isList: false, isMap: true }];

  for (let raw of lines) {
    const indent = raw.match(/^(\s*)/)[1].length;
    const trimmed = raw.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const top = stack[stack.length - 1];

    if (trimmed.startsWith('- ')) {
      const inner = trimmed.substring(2).trim();
      const kv = inner.match(/^([\w-]+)\s*:\s*(.*)$/);

      let container;
      if (top.isList && indent === top.indent) {
        container = top.obj;
      } else {
        const key = top.key;
        if (key) {
          const arr = [];
          if (top.isMap) top.obj[key] = arr;
          const newFrame = { obj: arr, indent, key: null, isList: true, isMap: false };
          stack.push(newFrame);
          container = arr;
        } else {
          continue;
        }
      }

      if (kv) {
        const obj = {};
        container.push(obj);
        const v = kv[2].trim();
        if (v) obj[kv[1]] = parseVal(v);
        stack.push({ obj, indent, key: kv[1], isList: false, isMap: true });
      } else {
        container.push(parseVal(inner));
      }
      continue;
    }

    const kv = trimmed.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) {
      let parent = top;
      while (!parent.isMap && stack.length > 1) {
        stack.pop();
        parent = stack[stack.length - 1];
      }
      const v = kv[2].trim();
      if (v) {
        parent.obj[kv[1]] = parseVal(v);
        stack.push({ obj: parent.obj, indent, key: null, isList: false, isMap: true });
      } else {
        parent.obj[kv[1]] = null;
        stack.push({ obj: parent.obj, indent, key: kv[1], isList: false, isMap: true });
      }
    }
  }
  return result;
}

function parseVal(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

const testFiles = [
  '/Users/ficor/Desktop/网站/vii.ink/src/content/essay/hello-world.md',
  '/Users/ficor/Desktop/网站/vii.ink/src/content/essay/animals.md',
  '/Users/ficor/Desktop/网站/vii.ink/src/content/essay/2025年终总结.md',
  '/Users/ficor/Desktop/网站/vii.ink/src/content/bits/1996-04-06-00-00-00.md',
  '/Users/ficor/Desktop/网站/vii.ink/src/content/bits/bits-2026-06-10-0733.md',
  '/Users/ficor/Desktop/网站/vii.ink/src/content/memo/index.md'
];

for (const f of testFiles) {
  const content = fs.readFileSync(f, 'utf-8');
  const { data, error } = parseFrontmatter(content);
  console.log('\n=== ' + path.basename(f) + ' ===');
  if (error) console.log('ERROR:', error);
  else console.log(JSON.stringify(data, null, 2));
}
