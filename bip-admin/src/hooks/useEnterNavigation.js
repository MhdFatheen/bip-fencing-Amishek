import { useEffect } from "react";

// =============================================================
//  useEnterNavigation — Enter moves to the next field (whole app)
//
//  • Enter in an input / select → focus the next field
//  • Enter in the LAST field    → save (submit the form, or click
//                                  the Save / Update button nearby)
//  • Skipped: textarea, buttons, links, search boxes, open dropdown
//    menus, and any field whose own onKeyDown already handled Enter
//    (e.g. Tax Invoice page, "New %" GST box).
// =============================================================

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]):not([readonly]),' +
  "select:not([disabled]), textarea:not([disabled]):not([readonly])";

const MODAL_SELECTOR =
  '.modal, [role="dialog"], .af-modal, .at-modal, .cl-modal, .ep-modal, .sl-modal';

const SAVE_TEXT =
  /\b(save|update|submit|record|confirm|login|log in|sign in|generate|pay|apply)\b/i;

const isVisible = (el) =>
  el.offsetParent !== null || el.getClientRects().length > 0;

const isSearchBox = (el) =>
  el.type === "search" ||
  /search|filter/i.test(
    `${el.name || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`,
  );

// The area whose fields belong together
function findScope(el) {
  const form = el.closest("form");
  if (form) return form;
  const modal = el.closest(MODAL_SELECTOR);
  if (modal) return modal;

  // Smallest card-like block that has its own Save-type button
  let node = el.parentElement;
  while (node && node !== document.body) {
    if (/card|panel|box|section|form/i.test(node.className || "") && findSaveButton(node)) {
      return node;
    }
    if (node.classList?.contains("page-content")) return node;
    node = node.parentElement;
  }
  return el.closest(".page-content") || document.body;
}

const DANGER_TEXT = /\b(delete|remove|cancel|close|clear|reset|logout|log out)\b/i;

function findSaveButton(scope) {
  const buttons = Array.from(scope.querySelectorAll("button")).filter(
    (b) =>
      !b.disabled &&
      isVisible(b) &&
      !DANGER_TEXT.test(b.textContent || "") &&
      !/danger|delete/i.test(b.className || ""),
  );
  return (
    // explicit type="submit" only (a <button> with no type is "submit" by default)
    buttons.find((b) => b.getAttribute("type") === "submit") ||
    buttons.reverse().find((b) => SAVE_TEXT.test(b.textContent || ""))
  );
}

export default function useEnterNavigation() {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

      const el = e.target;
      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "SELECT") return; // textarea keeps new lines
      if (["button", "submit", "reset", "image", "file"].includes(el.type)) return;
      if (isSearchBox(el)) return;
      // react-select / autocomplete: let Enter pick the option while the menu is open
      if (el.getAttribute("aria-expanded") === "true") return;

      const scope = findScope(el);
      const fields = Array.from(scope.querySelectorAll(FIELD_SELECTOR)).filter(
        (f) => isVisible(f) && f.tabIndex !== -1 && !isSearchBox(f),
      );
      const i = fields.indexOf(el);
      if (i === -1) return;

      e.preventDefault(); // never submit the form from a middle field

      const next = fields.slice(i + 1).find((f) => f.tagName !== "TEXTAREA") ||
        fields[i + 1];

      if (next) {
        next.focus();
        if (next.tagName === "INPUT" && typeof next.select === "function") {
          try { next.select(); } catch { /* some input types can't select */ }
        }
        return;
      }

      // Last field → save
      const form = el.closest("form");
      if (form) {
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.querySelector('[type="submit"]')?.click();
        return;
      }
      findSaveButton(scope)?.click();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}