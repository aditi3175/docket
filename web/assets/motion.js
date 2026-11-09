// motion.js — presentation only: elements rise into view as they scroll in, including content a page
// renders later from a chain read. It adds and removes classes and nothing else: it never writes text,
// so it can never change, round or invent a figure (I2), and it never delays one: the content is in
// the page as soon as it is rendered, only its entrance is animated.
//
// Enforces none of I1–I20 by itself; it keeps them by construction (no text is written here, tested in
// test/motion.test.mjs). prefers-reduced-motion: nothing is hidden and nothing moves.

export const REVEAL = [
  // tool pages
  '.lede2', '.stake', '.path-title', '.path-scroll', '.prose > section', '.banner', '.step', '.proposal',
  '.census-bar', '.lanes', '.tl > li', '.stats', '.tools', '.table-wrap', '.tm-fig',
  // homepage
  '.sh', '.dep', '.share', '.share-l', '.keyring .krow', '.flow .step', '.census-foot', '.card', '.why2 > div', '.promises li',
].join(', ');

export function startMotion({ root = document, selector = REVEAL } = {}) {
  const win = root.defaultView ?? window;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches || !win.IntersectionObserver) return () => {};
  const io = new win.IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

  const seen = new WeakSet();
  function take(el) {
    if (seen.has(el)) return;
    seen.add(el);
    // siblings entering together are staggered by their order among revealed siblings
    const sib = el.parentElement ? [...el.parentElement.children].filter((c) => seen.has(c)) : [];
    el.style.setProperty('--d', String(Math.min(sib.indexOf(el), 8)));
    el.classList.add('rv');
    io.observe(el);
  }
  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches(selector)) take(node);
    node.querySelectorAll(selector).forEach(take);
  };
  scan(root.body);
  const mo = new win.MutationObserver((list) => { for (const m of list) m.addedNodes.forEach(scan); });
  mo.observe(root.body, { childList: true, subtree: true });
  return () => { io.disconnect(); mo.disconnect(); };
}
