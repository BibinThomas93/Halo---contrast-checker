# Contrast Harmony — Plugin Context & Requirements

> Reference this file often to keep the plugin context when developing.

## Overview

**Plugin name:** Contrast Harmony  
**Purpose:** Audit text and icon contrast against WCAG 2.1, group identical issues, and fix colors in real time.

---

## 1. Visual Background Detection (Critical)

- **Don't rely only on the immediate parent.** For every text layer or vector icon:
  - Traverse **up the layer hierarchy** to find the first visible fill (solid color).
  - If no parent fill is found, use the **Page background color**.
  - Account for **absolute positioning**: use `figma.getAbsolutePosition` / `absoluteBoundingBox` to detect the layer directly behind the element when the parent is transparent.
  - For overlapping siblings, check layers behind (lower z-order) that intersect the element's bounds.

---

## 2. Contrast Logic (WCAG 2.1)

### Relative Luminance Formula
- L = 0.2126×R + 0.7152×G + 0.0722×B
- R, G, B must be **linearized** from sRGB:  
  If c ≤ 0.04045 → c/12.92, else → ((c+0.055)/1.055)^2.4

### Contrast Ratio
- (L_max + 0.05) / (L_min + 0.05)

### Text Category (WCAG)
| Category | Font Size (pt) | Font Size (px) | Font Weight |
|----------|----------------|----------------|-------------|
| Normal Text | Below 18pt | Below 24px | Any (if below 14pt/18.6px) |
| Large Text | 18pt+ | 24px+ | Any |
| Large Text | 14pt+ | 18.6px+ | Bold (700+) |

### Thresholds (WCAG 2.1)
| Text Type | Level AA (Minimum) | Level AAA (Enhanced) |
|-----------|-------------------|---------------------|
| Normal Text | 4.5:1 | 7:1 |
| Large Text | 3:1 | 4.5:1 |
| UI Components/Icons | 3:1 | N/A |

---

## 3. Grouping Logic

- Group issues by **"Unique Color Pairs"** (e.g. all #FFFFFF text on #00AAFF background).
- Avoid listing hundreds of individual layers; show one entry per color pair with a count.
- Group key format: `foregroundHex|backgroundHex|isText|isLargeText`

---

## 4. Fix & Sync UI

- Provide **hex inputs** for Foreground and Background.
- When the user changes a color in the UI, **immediately update** all Figma layers in that color-pair group.
- Use **standard Figma transform/undo behavior** (e.g. `figma.undoGroup`) so Undo works.
- Handle **Components and Instances** by applying overrides to instances or editing main components where appropriate.

---

## 5. Technical Stack

- **Framework:** React with Tailwind CSS
- **Language:** TypeScript
- **Icons:** Lucide-React
- **Build:** Vite for the UI bundle

---

## 6. UI & UX (Figma Style Guide)

- Background: #FFFFFF or #F5F5F5
- Text: Inter, 11px and 12px
- Borders: 1px solid #E6E6E6
- Primary button: #18A0FB
- Pass/Fail: green check / red cross
- **Simplest workflow:** Open plugin → Click "Scan Selection" → See grouped issues → Edit hex → "Apply to All"

---

## 7. Constraints

- Use `figma.notify` for success/error feedback.
- Handle Components and Instances correctly.
- **Performance:** Use `yield` or chunking for large files (>500 layers) to avoid UI freezing.

---

## 8. Key Files

| File | Role |
|------|------|
| `manifest.json` | Plugin metadata, id, main, ui |
| `code.ts` | Plugin logic, contrast math, background detection, grouping, apply fix |
| `src/ui.tsx` | React UI: Scan button, grouped issues list, hex inputs, Apply button |
| `ui.html` | Loads built `ui.js` |
| `vite.config.ts` | Builds React → ui.js |
| `tailwind.config.js` | Tailwind + Figma-style tokens |

---

## 9. Message Types (UI ↔ Code)

| Direction | Type | Payload |
|-----------|------|---------|
| UI → Code | `scan` | — |
| Code → UI | `scan-result` | `{ issues: ContrastIssue[] }` |
| UI → Code | `apply-fix` | `{ issue, newFgHex, newBgHex }` |
| Code → UI | `fix-applied` | — |
| UI → Code | `cancel` | — |

---

## 10. ContrastIssue Shape

```ts
interface ContrastIssue {
  foregroundHex: string;
  backgroundHex: string;
  ratio: number;
  requiredRatio: number;
  nodeIds: string[];
  isText: boolean;
  isLargeText: boolean;
}
```
