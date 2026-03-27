import { readSmokeFixtureHtml, reportSmokeCheckResult } from './smoke-utils.mjs';

const getFigureBlock = (html) => {
  const match = html.match(
    /<figure[^>]*\bclass="[^"]*\bfigure\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/i
  );
  return match ? match[1] : '';
};

const checks = [
  {
    id: 'figure.wrapper',
    test: (html) => /<figure[^>]*\bclass="[^"]*\bfigure\b/.test(html)
  },
  {
    id: 'figure.media',
    test: (html) => /<(img|picture)\b/i.test(getFigureBlock(html))
  },
  {
    id: 'figure.caption',
    test: (html) => /<figcaption[^>]*\bclass="[^"]*\bfigure-caption\b/.test(getFigureBlock(html))
  }
];

const html = await readSmokeFixtureHtml('Figure check');
const failed = checks.filter((item) => !item.test(html)).map((item) => item.id);

reportSmokeCheckResult('Figure check', failed);
