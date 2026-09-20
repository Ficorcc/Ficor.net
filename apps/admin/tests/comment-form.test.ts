import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 评论表单被反复改坏过几次（少字段、蜜罐被误删、[hidden] 失效），
// 这里用源码级断言把关键不变量钉住 —— 组件是 .astro，没法直接 import 渲染。
const component = readFileSync(
  new URL('../../../src/components/AstroComments.astro', import.meta.url),
  'utf8'
);
const settings = readFileSync(
  new URL('../src/lib/server/fiscus/settings.ts', import.meta.url),
  'utf8'
);

/** 取 <form> 那一段，避免匹配到别处的同名属性 */
const formMarkup = component.slice(
  component.indexOf('<form class="ac-form"'),
  component.indexOf('</form>')
);
const styleBlock = component.slice(component.indexOf('<style>'));

describe('评论表单结构', () => {
  it('昵称 / 邮箱 / 网址 三个输入栏都在', () => {
    expect(formMarkup).toMatch(/name="authorName"/);
    expect(formMarkup).toMatch(/name="authorEmail"/);
    expect(formMarkup).toMatch(/name="authorUrl"/);
  });

  it('昵称与邮箱必填，网址选填', () => {
    const nameField = formMarkup.slice(formMarkup.indexOf('name="authorName"'));
    const emailField = formMarkup.slice(formMarkup.indexOf('name="authorEmail"'));
    const urlField = formMarkup.slice(formMarkup.indexOf('name="authorUrl"'));

    expect(nameField.slice(0, nameField.indexOf('/>'))).toMatch(/required/);
    expect(emailField.slice(0, emailField.indexOf('/>'))).toMatch(/required/);
    // 网址不该带 required，否则会把没个人站点的访客挡在门外
    expect(urlField.slice(0, urlField.indexOf('/>'))).not.toMatch(/required/);
  });

  it('网址栏带 data-url-field，供后台开关控制显隐', () => {
    const label = formMarkup.slice(0, formMarkup.indexOf('name="authorUrl"'));
    const lastLabelOpen = label.lastIndexOf('<label');
    expect(formMarkup.slice(lastLabelOpen, lastLabelOpen + 80)).toMatch(/data-url-field/);
    expect(component).toMatch(/urlField\.hidden\s*=\s*settings\.allowAuthorUrl\s*===\s*false/);
  });
});

describe('反垃圾蜜罐', () => {
  it('隐藏字段名必须是 website，与后端 +server.ts 的判断对应', () => {
    expect(formMarkup).toMatch(/name="website"/);
    expect(formMarkup).toMatch(/class="ac-honeypot"/);
  });

  it('蜜罐保持视觉隐藏', () => {
    expect(styleBlock).toMatch(/\.ac-honeypot\s*\{[^}]*display:\s*none/);
  });
});

describe('隐藏态样式', () => {
  it('[hidden] 必须有显式兜底，否则被 display:grid 盖掉', () => {
    // .ac-form / .ac-field 都是 display:grid，作者样式优先级高于 UA 的 [hidden]{display:none}
    const guard = styleBlock.match(/\.ac-form\[hidden\][\s\S]{0,80}?display:\s*none/);
    expect(guard).not.toBeNull();
    expect(styleBlock).toMatch(/\.ac-field\[hidden\]/);
  });
});

describe('表单排布', () => {
  it('三列排布，窄屏回落单列', () => {
    expect(styleBlock).toMatch(/\.ac-row\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
    expect(styleBlock).toMatch(/@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.ac-row[\s\S]*?grid-template-columns:\s*1fr/);
  });
});

describe('后台设置键 allowAuthorUrl', () => {
  it('默认开启，且暴露给前台', () => {
    expect(settings).toMatch(/allowAuthorUrl:\s*true/);
    // 从 `= [` 开始切，别被类型标注 `SettingKey[]` 里的 `]` 截断
    const start = settings.indexOf('const PUBLIC_SETTING_KEYS');
    const arrayStart = settings.indexOf('= [', start);
    const arrayEnd = settings.indexOf('];', arrayStart);
    const publicKeys = settings.slice(arrayStart, arrayEnd);
    expect(publicKeys).toMatch(/"allowAuthorUrl"/);
  });

  it('commentHeading 保持下线，别被顺手加回来', () => {
    expect(settings).not.toMatch(/commentHeading:\s*string/);
    expect(settings).not.toMatch(/"commentHeading"/);
  });
});
