// Contrast Harmony - WCAG 2.1 Contrast Audit Plugin
// Handles: text layers, vector icons, background detection, grouping, fix & sync

type RGBColor = { r: number; g: number; b: number };

const PAGE_BG: RGBColor = { r: 1, g: 1, b: 1 };
const MAX_CANDIDATES = 2000;
const MAX_VISITS = 5000;

function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: RGBColor): number {
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHex(rgb: RGBColor): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToRgb(hex: string): RGBColor | null {
  const m = hex.replace(/^#/, '').match(/^([0-9A-Fa-f]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255
  };
}

function hasVisibleSolidFill(node: SceneNode): boolean {
  if (!('fills' in node) || !node.fills || !Array.isArray(node.fills)) return false;
  for (const fill of node.fills) {
    if (fill.visible === false) continue;
    if (fill.type === 'SOLID') return true;
  }
  return false;
}

function getFirstVisibleSolidFill(node: SceneNode): RGBColor | null {
  if (!('fills' in node) || !node.fills || !Array.isArray(node.fills)) return null;
  const fills = node.fills as readonly Paint[];
  for (const fill of fills) {
    if (fill.visible === false) continue;
    if (fill.type === 'SOLID' && fill.color) return fill.color;
  }
  return null;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x ||
    a.y + a.height < b.y || b.y + b.height < a.y);
}

function findBackgroundForNode(node: SceneNode, page: PageNode): RGBColor {
  const bbox = node.absoluteBoundingBox;
  if (!bbox) return PAGE_BG;

  let n: BaseNode | null = node.parent;
  let depth = 0;
  const maxDepth = 10;
  while (n && n !== page && depth < maxDepth) {
    depth++;
    if (hasVisibleSolidFill(n as SceneNode)) {
      const fill = getFirstVisibleSolidFill(n as SceneNode);
      if (fill) return fill;
    }
    n = n.parent;
  }

  const parent = node.parent;
  if (parent && 'children' in parent) {
    const siblings = parent.children as readonly SceneNode[];
    const idx = siblings.indexOf(node);
    const maxSiblings = 20;
    if (idx > 0) {
      for (let i = idx - 1, count = 0; i >= 0 && count < maxSiblings; i--, count++) {
        const s = siblings[i];
        if (!('visible' in s) || s.visible === false) continue;
        const sb = ('absoluteBoundingBox' in s) ? s.absoluteBoundingBox : null;
        if (sb && rectsOverlap(bbox, sb) && hasVisibleSolidFill(s)) {
          const fill = getFirstVisibleSolidFill(s);
          if (fill) return fill;
        }
      }
    }
  }

  return PAGE_BG;
}

/** Returns the id of the node that provides the background (parent with fill or overlapping sibling). Used when applying background color. */
function findBackgroundNodeId(node: SceneNode, page: PageNode): string | null {
  const bbox = node.absoluteBoundingBox;
  if (!bbox) return null;

  let n: BaseNode | null = node.parent;
  let depth = 0;
  const maxDepth = 10;
  while (n && n !== page && depth < maxDepth) {
    depth++;
    if (hasVisibleSolidFill(n as SceneNode)) {
      return n.id;
    }
    n = n.parent;
  }

  const parent = node.parent;
  if (parent && 'children' in parent) {
    const siblings = parent.children as readonly SceneNode[];
    const idx = siblings.indexOf(node);
    const maxSiblings = 20;
    if (idx > 0) {
      for (let i = idx - 1, count = 0; i >= 0 && count < maxSiblings; i--, count++) {
        const s = siblings[i];
        if (!('visible' in s) || s.visible === false) continue;
        const sb = ('absoluteBoundingBox' in s) ? s.absoluteBoundingBox : null;
        if (sb && rectsOverlap(bbox, sb) && hasVisibleSolidFill(s)) {
          return s.id;
        }
      }
    }
  }

  return null;
}

function getForegroundColor(node: SceneNode): RGBColor | null {
  if (!('fills' in node) || !node.fills) return null;
  const fills = Array.isArray(node.fills) ? node.fills : [];
  for (const fill of fills) {
    if (fill.visible !== false && fill.type === 'SOLID' && fill.color)
      return fill.color;
  }
  return null;
}

/**
 * WCAG Large Text definition:
 * - 18pt+ (24px+): any weight
 * - 14pt+ (18.6px+): Bold (700+)
 * Otherwise: Normal Text
 */
function isLargeText(node: TextNode): boolean {
  const fs = node.fontSize;
  if (typeof fs !== 'number') return false;
  if (fs >= 18) return true; // 18pt+ = Large, any weight
  if (fs >= 14) {
    const style = node.fontName !== figma.mixed
      ? (node.fontName as FontName).style.toLowerCase()
      : '';
    return style.includes('bold') || style.includes('black') || style.includes('heavy') || style.includes('extrabold');
  }
  return false;
}

function isTextNode(node: SceneNode): node is TextNode {
  return node.type === 'TEXT';
}

function isVectorOrIcon(node: SceneNode): boolean {
  return node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'STAR' || node.type === 'LINE' || node.type === 'ELLIPSE' ||
    node.type === 'POLYGON' || node.type === 'RECTANGLE';
}

/**
 * Collect and process text/icons - fully synchronous (no async/setTimeout).
 * Hard limits: MAX_VISITS nodes traversed, MAX_CANDIDATES collected.
 */
function collectAndProcess(
  selection: readonly SceneNode[],
  page: PageNode
): Array<{ node: SceneNode; fg: RGBColor; bg: RGBColor; isText: boolean; isLarge: boolean }> {
  const items: Array<{ node: SceneNode; fg: RGBColor; bg: RGBColor; isText: boolean; isLarge: boolean }> = [];
  let visited = 0;

  function walk(n: SceneNode): boolean {
    visited++;
    if (visited > MAX_VISITS) return false;
    if (items.length >= MAX_CANDIDATES) return false;
    if (n.visible === false) return true;

    if (isTextNode(n)) {
      const fg = getForegroundColor(n);
      if (fg) {
        const bg = findBackgroundForNode(n, page);
        items.push({ node: n, fg, bg, isText: true, isLarge: isLargeText(n) });
      }
      return true;
    }
    if (isVectorOrIcon(n)) {
      const fg = getForegroundColor(n);
      if (fg) {
        const bg = findBackgroundForNode(n, page);
        items.push({ node: n, fg, bg, isText: false, isLarge: false });
      }
    }
    if ('children' in n) {
      for (const c of n.children) {
        if (visited > MAX_VISITS || items.length >= MAX_CANDIDATES) return false;
        if (!walk(c as SceneNode)) return false;
      }
    }
    return true;
  }

  for (const s of selection) {
    if (visited > MAX_VISITS || items.length >= MAX_CANDIDATES) break;
    if (!walk(s as SceneNode)) break;
  }
  return items;
}

interface ContrastIssue {
  foregroundHex: string;
  backgroundHex: string;
  ratio: number;
  requiredAA: number;
  requiredAAA: number | null; // null for UI components (no AAA requirement)
  passAA: boolean;
  passAAA: boolean | null;
  nodeIds: string[];
  isText: boolean;
  isLargeText: boolean;
  elementType: string; // 'normal-text' | 'large-text' | 'ui-component'
}

/**
 * WCAG 2.1 Contrast Requirements:
 * - Normal Text (<18pt): AA = 4.5:1, AAA = 7:1
 * - Large Text (18pt+ or 14pt bold+): AA = 3:1, AAA = 4.5:1
 * - UI Components/Icons: AA = 3:1, AAA = N/A
 */
function getContrastRequirements(isText: boolean, isLarge: boolean): { aa: number; aaa: number | null; type: string } {
  if (!isText) {
    return { aa: 3, aaa: null, type: 'ui-component' };
  }
  if (isLarge) {
    return { aa: 3, aaa: 4.5, type: 'large-text' };
  }
  return { aa: 4.5, aaa: 7, type: 'normal-text' };
}

function buildIssuesAndPassed(
  items: Array<{ node: SceneNode; fg: RGBColor; bg: RGBColor; isText: boolean; isLarge: boolean }>
): { issues: ContrastIssue[]; passed: ContrastIssue[] } {
  const issuesMap = new Map<string, ContrastIssue>();
  const passedMap = new Map<string, ContrastIssue>();

  for (const { node, fg, bg, isText, isLarge } of items) {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const ratio = contrastRatio(l1, l2);
    const req = getContrastRequirements(isText, isLarge);
    const passAA = ratio >= req.aa;
    const passAAA = req.aaa !== null ? ratio >= req.aaa : null;

    const fgHex = rgbToHex(fg);
    const bgHex = rgbToHex(bg);
    const key = `${fgHex}|${bgHex}|${isText}|${isLarge}`;
    const entry: ContrastIssue = {
      foregroundHex: fgHex,
      backgroundHex: bgHex,
      ratio,
      requiredAA: req.aa,
      requiredAAA: req.aaa,
      passAA,
      passAAA,
      nodeIds: [],
      isText,
      isLargeText: isLarge,
      elementType: req.type
    };

    if (!passAA) {
      if (!issuesMap.has(key)) {
        issuesMap.set(key, { ...entry, nodeIds: [] });
      }
      issuesMap.get(key)!.nodeIds.push(node.id);
    } else {
      if (!passedMap.has(key)) {
        passedMap.set(key, { ...entry, nodeIds: [] });
      }
      passedMap.get(key)!.nodeIds.push(node.id);
    }
  }

  return {
    issues: Array.from(issuesMap.values()),
    passed: Array.from(passedMap.values())
  };
}

async function applyFix(issue: ContrastIssue, newFgHex: string | null, newBgHex: string | null) {
  const newFg = newFgHex ? hexToRgb(newFgHex) : null;
  const newBg = newBgHex ? hexToRgb(newBgHex) : null;
  if (!newFg && !newBg) return;

  const page = figma.currentPage;

  for (const id of issue.nodeIds) {
    const node = await figma.getNodeByIdAsync(id) as SceneNode | null;
    if (!node) continue;

    if (newFg && 'fills' in node && node.fills && Array.isArray(node.fills)) {
      const updated = node.fills.map(f => {
        if (f.type === 'SOLID' && f.visible !== false) {
          return { ...f, color: newFg };
        }
        return f;
      }) as Paint[];
      node.fills = updated;
    }

    if (newBg) {
      const bgNodeId = findBackgroundNodeId(node, page);
      if (bgNodeId) {
        const bgNode = await figma.getNodeByIdAsync(bgNodeId) as SceneNode | null;
        if (bgNode && 'fills' in bgNode) {
          const fills = bgNode.fills as readonly Paint[] | undefined;
          if (fills && fills.length > 0 && fills[0].type === 'SOLID') {
            (bgNode as GeometryMixin).fills = [{ ...fills[0], color: newBg }];
          } else {
            (bgNode as GeometryMixin).fills = [{ type: 'SOLID', color: newBg }];
          }
        }
      }
    }
  }
}

figma.showUI(__html__, { width: 360, height: 520 });

figma.ui.onmessage = (msg: { type: string; [k: string]: unknown }) => {
  if (msg.type === 'scan') {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify('Select one or more layers to scan.');
      figma.ui.postMessage({ type: 'scan-result', issues: [], passed: [], all: [] });
      return;
    }
    const items = collectAndProcess(selection as SceneNode[], figma.currentPage);
    const { issues, passed } = buildIssuesAndPassed(items);
    const limitMsg = items.length >= MAX_CANDIDATES ? ' (limit)' : '';
    figma.notify(
      issues.length === 0
        ? `Scanned ${items.length} layers. No contrast issues.${limitMsg}`
        : `Scanned ${items.length} layers. Found ${issues.length} contrast issue(s).${limitMsg}`
    );
    const all = [...issues, ...passed];
    figma.ui.postMessage({ type: 'scan-result', issues, passed, all });
    return;
  }

  if (msg.type === 'apply-fix') {
    const payload = msg as unknown as { issue: ContrastIssue; newFgHex: string | null; newBgHex: string | null };
    const { issue, newFgHex, newBgHex } = payload;
    if (issue && (newFgHex || newBgHex)) {
      applyFix(issue, newFgHex, newBgHex).then(() => {
        figma.notify('Applied color fix.');
        figma.ui.postMessage({ type: 'fix-applied' });
      }).catch(err => {
        figma.notify('Error applying fix: ' + err.message);
      });
    }
    return;
  }

  if (msg.type === 'hover-issue') {
    const payload = msg as unknown as { nodeIds: string[] };
    const nodeIds = payload?.nodeIds;
    if (nodeIds && nodeIds.length > 0) {
      (async () => {
        const nodes: SceneNode[] = [];
        const limit = Math.min(nodeIds.length, 25);
        for (let j = 0; j < limit; j++) {
          const node = await figma.getNodeByIdAsync(nodeIds[j]) as SceneNode | null;
          if (node) nodes.push(node);
        }
        if (nodes.length > 0) {
          figma.currentPage.selection = nodes;
        }
      })();
    }
    return;
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
