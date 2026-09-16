import { formatFeedDate, feedSummary, webUrl, imageUrl, type publicCommunity } from './community';

type PublicData = ReturnType<typeof publicCommunity>;
const loading = new WeakSet<HTMLElement>();

export async function updateCommunityPage() {
  const root = document.querySelector<HTMLElement>('[data-community]');
  if (!root || loading.has(root)) return;
  loading.add(root);
  const status = root.querySelector<HTMLElement>('[data-community-status]')!;
  try {
    const response = await fetch('/admin/api/community/', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Unavailable');
    const data: PublicData = await response.json();
    if (!Array.isArray(data.links) || !Array.isArray(data.latestItems) || !data.siteInfo) throw new Error('Invalid data');
    if (!root.isConnected) return;
    const kind = root.dataset.community;
    const list = root.querySelector(kind === 'links' ? '.links-grid' : '.feed-list')!;
    const template = root.querySelector<HTMLTemplateElement>(kind === 'links' ? '[data-link-template]' : '[data-feed-template]')!;
    const fragment = document.createDocumentFragment();
    if (kind === 'links') {
      for (const link of data.links) {
        if (!webUrl(link.url)) continue;
        const node = template.content.cloneNode(true) as DocumentFragment;
        node.querySelector('a')!.href = webUrl(link.url);
        const img = node.querySelector('img')!;
        const avatar = imageUrl(link.avatar);
        if (avatar) img.src = avatar; else img.remove();
        node.querySelector('h3')!.textContent = link.name;
        node.querySelector('p')!.textContent = link.description;
        fragment.append(node);
      }
      const info = data.siteInfo;
      root.querySelector('[data-site-title]')!.textContent = info.title;
      const url = root.querySelector<HTMLAnchorElement>('[data-site-url]')!;
      url.textContent = info.url;
      if (webUrl(info.url)) url.href = webUrl(info.url); else url.removeAttribute('href');
      const avatar = root.querySelector<HTMLImageElement>('[data-site-avatar]')!;
      avatar.alt = info.title;
      if (imageUrl(info.avatar)) avatar.src = imageUrl(info.avatar); else avatar.removeAttribute('src');
      root.querySelectorAll<HTMLElement>('[data-site-field]').forEach((el) => { el.textContent = info[el.dataset.siteField as keyof typeof info]; });
      root.querySelectorAll<HTMLElement>('[data-site-copy]').forEach((el) => { el.dataset.text = info[el.dataset.siteCopy as keyof typeof info]; });
    } else {
      for (const item of data.latestItems) {
        if (!webUrl(item.url)) continue;
        const node = template.content.cloneNode(true) as DocumentFragment;
        node.querySelector('a')!.href = webUrl(item.url);
        node.querySelector('.feed-source')!.textContent = item.source;
        node.querySelector('.feed-date')!.textContent = formatFeedDate(item.date);
        node.querySelector('.feed-title')!.textContent = item.title;
        node.querySelector('.feed-summary')!.textContent = feedSummary(item.summary);
        fragment.append(node);
      }
      root.querySelector('[data-feed-count]')!.textContent = String(data.latestItems.length);
    }
    list.replaceChildren(fragment);
    root.querySelector<HTMLElement>('[data-community-empty]')!.hidden = list.childElementCount > 0;
    status.textContent = '';
  } catch {
    if (root.isConnected) status.textContent = '暂时无法获取最新数据，当前显示上次构建的内容。';
  } finally { loading.delete(root); }
}
