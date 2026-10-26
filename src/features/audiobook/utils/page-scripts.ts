/**
 * Scripts run in the reader's page (`ReadiumViewRef.evaluateJavaScript`),
 * for what only the page can say exactly.
 */

/** The decoration group the sentence being heard is lit in. */
export const READ_ALONG_GROUP = 'read-along';

/**
 * Whether the sentence being heard is on screen: 'on' or 'off'. Readium draws
 * a decoration group's boxes inside an element marked with its name (the same
 * decorator script on Android and iOS), so this asks whether any of them is
 * inside the screen. A sentence that runs over two pages is on both.
 */
export const VOICE_ON_SCREEN_SCRIPT = `(function () {
  var w = window.innerWidth, h = window.innerHeight;
  var group = document.querySelector('[data-group="${READ_ALONG_GROUP}"]');
  var boxes = group ? group.querySelectorAll('*') : [];
  for (var i = 0; i < boxes.length; i++) {
    var r = boxes[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < w && r.bottom > 0 && r.top < h) return 'on';
  }
  return 'off';
})()`;

/**
 * The text from the first character on screen, about 200 characters of it,
 * or null.
 *
 * Exact where Readium's own answers are not: the page's progression is a
 * share of its pages, which a share of the text only estimates, and its
 * first visible element can begin a page or more back. The first text node
 * with a box on screen is found, then the first of its characters on screen
 * by halving (those before it sit on earlier pages: left of the screen when
 * paginated, above it when scrolled).
 */
export const FIRST_VISIBLE_TEXT_SCRIPT = `(function () {
  var w = window.innerWidth, h = window.innerHeight;
  var onScreen = function (r) { return r.width > 0 && r.right > 0 && r.left < w && r.bottom > 0 && r.top < h; };
  var before = function (r) { return r.right <= 0 || r.bottom <= 0; };
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var range = document.createRange();
  var node;
  while ((node = walker.nextNode())) {
    var text = node.textContent || '';
    if (!text.trim()) continue;
    range.selectNodeContents(node);
    var rects = range.getClientRects(), seen = false;
    for (var i = 0; i < rects.length && !seen; i++) seen = onScreen(rects[i]);
    if (!seen) continue;
    var lo = 0, hi = text.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      range.setStart(node, mid);
      range.setEnd(node, mid + 1);
      if (before(range.getBoundingClientRect())) lo = mid + 1; else hi = mid;
    }
    var out = text.slice(lo);
    while (out.length < 200 && (node = walker.nextNode())) out += node.textContent || '';
    return out.slice(0, 200);
  }
  return null;
})()`;
