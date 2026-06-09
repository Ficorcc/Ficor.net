import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.join(__dirname, '..', 'src', 'content');

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) {
    return { data: null, error: '缺少 frontmatter (--- ... ---)' };
  }
  try {
    const data = parseYaml(match[1]);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: 'YAML 解析失败: ' + e.message };
  }
}

function parseYaml(str) {
  const rawLines = str.split(/\r?\n/);
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    let raw = rawLines[i];
    raw = raw.replace(/\t/g, '  ');
    if (!raw.trim()) continue;
    if (raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^(\s*)/)[1].length;
    lines.push({ indent, content: raw.trim() });
  }

  if (lines.length === 0) return {};

  const result = {};
  parseMapContent(lines, 0, -1, result);
  return result;
}

function parseMapContent(lines, startIdx, parentIndent, target) {
  let i = startIdx;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.indent <= parentIndent) break;

    if (ln.content.startsWith('- ')) {
      break;
    }

    const kv = ln.content.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) {
      const k = kv[1];
      const v = kv[2].trim();
      if (v) {
        target[k] = parseValue(v);
        i++;
      } else {
        const nextIdx = i + 1;
        if (nextIdx < lines.length) {
          const nextLn = lines[nextIdx];
          if (nextLn.content.startsWith('- ') && nextLn.indent > parentIndent) {
            const arr = [];
            i = parseListContent(lines, nextIdx, ln.indent, arr);
            target[k] = arr;
          } else if (nextLn.indent > ln.indent) {
            const obj = {};
            i = parseMapContent(lines, nextIdx, ln.indent, obj);
            target[k] = Object.keys(obj).length > 0 ? obj : null;
          } else {
            target[k] = null;
            i++;
          }
        } else {
          target[k] = null;
          i++;
        }
      }
    } else {
      i++;
    }
  }
  return i;
}

function parseListContent(lines, startIdx, parentIndent, target) {
  let i = startIdx;
  const listIndent = lines[startIdx] ? lines[startIdx].indent : parentIndent + 2;

  while (i < lines.length) {
    const ln = lines[i];
    if (ln.indent < listIndent) break;
    if (ln.indent > listIndent) { i++; continue; }
    if (!ln.content.startsWith('- ')) break;

    const rest = ln.content.substring(2).trim();
    const kvMatch = rest.match(/^([\w-]+)\s*:\s*(.*)$/);

    if (kvMatch) {
      const k = kvMatch[1];
      const v = kvMatch[2].trim();
      const obj = {};
      if (v) obj[k] = parseValue(v);

      let j = i + 1;
      while (j < lines.length && lines[j].indent > listIndent) {
        const sub = lines[j];
        const subKv = sub.content.match(/^([\w-]+)\s*:\s*(.*)$/);
        if (subKv && !sub.content.startsWith('- ')) {
          const subV = subKv[2].trim();
          if (subV) {
            obj[subKv[1]] = parseValue(subV);
          } else {
            const nextJ = j + 1;
            if (nextJ < lines.length && lines[nextJ].content.startsWith('- ') && lines[nextJ].indent > listIndent) {
              const arr = [];
              j = parseListContent(lines, nextJ, sub.indent, arr);
              obj[subKv[1]] = arr;
              continue;
            }
          }
        }
        j++;
        if (j < lines.length && lines[j].indent <= listIndent) break;
      }
      target.push(Object.keys(obj).length > 0 ? obj : parseValue(rest));
      i = j;
    } else {
      target.push(parseValue(rest));
      i++;
    }
  }
  return i;
}

function parseInlineArray(v) {
  const inner = v.substring(1, v.length - 1).trim();
  if (!inner) return [];
  const items = [];
  let current = '';
  let depth = 0;
  let inQuote = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      if (ch === inQuote && inner[i - 1] !== '\\') inQuote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
    } else if (ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ']') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      items.push(parseValue(current.trim()));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(parseValue(current.trim()));
  return items;
}

function parseValue(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (v.startsWith('[') && v.endsWith(']')) return parseInlineArray(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

function isValidDate(val) {
  if (val === null || val === undefined) return false;
  if (val instanceof Date) return !isNaN(val.getTime());
  if (typeof val === 'number') return !isNaN(new Date(val).getTime());
  if (typeof val !== 'string') return false;
  const str = val.trim();
  if (!str) return false;
  const re1 = /^\d{4}-\d{2}-\d{2}$/;
  const re2 = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:?\d{2}|Z|z)?$/;
  if (re1.test(str)) return !isNaN(new Date(str + 'T00:00:00Z').getTime());
  if (re2.test(str)) return !isNaN(new Date(str).getTime());
  return false;
}

function isKebabCase(str) {
  if (typeof str !== 'string') return false;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(str);
}

function validateEssay(data) {
  const issues = [];
  if (!data || typeof data !== 'object') { issues.push('frontmatter 为空或格式错误'); return issues; }
  if (data.title === undefined || data.title === null || data.title === '') issues.push('缺少必填字段: title');
  else if (typeof data.title !== 'string') issues.push('title 必须是字符串 (当前: ' + typeof data.title + ')');
  if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') issues.push('description 必须是字符串');
  if (data.date === undefined || data.date === null || data.date === '') issues.push('缺少必填字段: date');
  else if (!isValidDate(data.date)) issues.push('date 格式无法解析: ' + JSON.stringify(data.date));
  if (data.tags !== undefined && data.tags !== null && !Array.isArray(data.tags)) issues.push('tags 必须是数组');
  if (data.draft !== undefined && data.draft !== null && typeof data.draft !== 'boolean') issues.push('draft 必须是 boolean (当前值: ' + JSON.stringify(data.draft) + ')');
  if (data.archive !== undefined && data.archive !== null && typeof data.archive !== 'boolean') issues.push('archive 必须是 boolean (当前值: ' + JSON.stringify(data.archive) + ')');
  if (data.slug !== undefined && data.slug !== null && data.slug !== '') {
    if (typeof data.slug !== 'string') issues.push('slug 必须是字符串');
    else if (!isKebabCase(data.slug)) issues.push('slug 不符合 kebab-case 小写: "' + data.slug + '"');
  }
  if (data.cover !== undefined && data.cover !== null && typeof data.cover !== 'string') issues.push('cover 必须是字符串');
  if (data.badge !== undefined && data.badge !== null && typeof data.badge !== 'string') issues.push('badge 必须是字符串');
  if (data.category !== undefined && data.category !== null && typeof data.category !== 'string') issues.push('category 必须是字符串');
  return issues;
}

function validateBits(data) {
  const issues = [];
  if (!data || typeof data !== 'object') { issues.push('frontmatter 为空或格式错误'); return issues; }
  if (data.title !== undefined && data.title !== null && typeof data.title !== 'string') issues.push('title 必须是字符串');
  if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') issues.push('description 必须是字符串');
  if (data.date === undefined || data.date === null || data.date === '') issues.push('缺少必填字段: date');
  else if (!isValidDate(data.date)) issues.push('date 格式无法解析: ' + JSON.stringify(data.date));
  if (data.tags !== undefined && data.tags !== null && !Array.isArray(data.tags)) issues.push('tags 必须是数组');
  if (data.draft !== undefined && data.draft !== null && typeof data.draft !== 'boolean') issues.push('draft 必须是 boolean (当前值: ' + JSON.stringify(data.draft) + ')');
  if (data.slug !== undefined && data.slug !== null && data.slug !== '') {
    if (typeof data.slug !== 'string') issues.push('slug 必须是字符串');
    else if (!isKebabCase(data.slug)) issues.push('slug 不符合 kebab-case 小写: "' + data.slug + '"');
  }
  if (data.images !== undefined && data.images !== null) {
    if (!Array.isArray(data.images)) issues.push('images 必须是数组 [{ src, width, height, alt? }]');
    else {
      data.images.forEach((img, idx) => {
        if (!img || typeof img !== 'object') { issues.push('images[' + idx + '] 必须是对象'); return; }
        if (img.src === undefined || img.src === null || img.src === '') issues.push('images[' + idx + '].src 必填');
        if (img.width === undefined || img.width === null) issues.push('images[' + idx + '].width 必填');
        if (img.height === undefined || img.height === null) issues.push('images[' + idx + '].height 必填');
        if (img.alt !== undefined && img.alt !== null && typeof img.alt !== 'string') issues.push('images[' + idx + '].alt 必须是字符串');
      });
    }
  }
  if (data.author !== undefined && data.author !== null) {
    if (typeof data.author !== 'object') issues.push('author 必须是对象 (包含 name?, avatar?)');
    else {
      if (data.author.name !== undefined && data.author.name !== null && typeof data.author.name !== 'string') issues.push('author.name 必须是字符串');
      if (data.author.avatar !== undefined && data.author.avatar !== null && typeof data.author.avatar !== 'string') issues.push('author.avatar 必须是字符串');
    }
  }
  return issues;
}

function validateMemo(data) {
  const issues = [];
  if (!data || typeof data !== 'object') { issues.push('frontmatter 为空或格式错误'); return issues; }
  if (data.title === undefined || data.title === null || data.title === '') issues.push('缺少必填字段: title');
  else if (typeof data.title !== 'string') issues.push('title 必须是字符串');
  if (data.subtitle !== undefined && data.subtitle !== null && typeof data.subtitle !== 'string') issues.push('subtitle 必须是字符串');
  if (data.date !== undefined && data.date !== null && data.date !== '' && !isValidDate(data.date)) issues.push('date 格式无法解析: ' + JSON.stringify(data.date));
  if (data.draft !== undefined && data.draft !== null && typeof data.draft !== 'boolean') issues.push('draft 必须是 boolean (当前值: ' + JSON.stringify(data.draft) + ')');
  return issues;
}

function getMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) continue;
    if (entry.name.endsWith('.md')) results.push(full);
  }
  return results.sort();
}

function processDir(dirName, validator) {
  const dir = path.join(CONTENT_DIR, dirName);
  const files = getMdFiles(dir);
  const report = { dir: dirName, total: files.length, hasIssues: 0, issues: [] };
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const { data, error } = parseFrontmatter(content);
    const relPath = path.relative(CONTENT_DIR, file);
    if (error) {
      report.hasIssues++;
      report.issues.push({ file: relPath, issues: [error] });
      continue;
    }
    const issues = validator(data);
    if (issues.length > 0) {
      report.hasIssues++;
      report.issues.push({ file: relPath, issues });
    }
  }
  return report;
}

function printReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log('目录: ' + report.dir + '/  (共 ' + report.total + ' 个文件, 有问题 ' + report.hasIssues + ' 个)');
  console.log('='.repeat(70));
  if (report.issues.length === 0) { console.log('  ✓ 全部符合要求，无问题'); return; }
  for (const item of report.issues) {
    console.log('\n  ✗ ' + item.file);
    for (const issue of item.issues) console.log('    - ' + issue);
  }
}

const testMode = process.argv[2] === '--test';
if (testMode) {
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
    if (error) console.log('ERROR:', error); else console.log(JSON.stringify(data, null, 2));
  }
} else {
  const essayReport = processDir('essay', validateEssay);
  const bitsReport = processDir('bits', validateBits);
  const memoReport = processDir('memo', validateMemo);
  printReport(essayReport);
  printReport(bitsReport);
  printReport(memoReport);
  const totalFiles = essayReport.total + bitsReport.total + memoReport.total;
  const totalIssues = essayReport.hasIssues + bitsReport.hasIssues + memoReport.hasIssues;
  console.log('\n' + '='.repeat(70));
  console.log('总计: ' + totalFiles + ' 个文件, ' + totalIssues + ' 个存在问题');
  console.log('='.repeat(70));
}
