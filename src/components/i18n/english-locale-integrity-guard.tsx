"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { localizeDemoValue } from "@/lib/demo-data";
import { visibleBusinessText } from "@/lib/visible-business-text";

function normalizeNodeText(node: Text) {
  const current = node.nodeValue ?? "";
  if (!/[\u3400-\u9fff]/.test(current)) return;
  let next = visibleBusinessText(current, "en");
  if (/[\u3400-\u9fff]/.test(next)) {
    next = localizeDemoValue(next, "en");
  }
  if (/[\u3400-\u9fff]/.test(next)) {
    next = "Review customer evidence";
  }
  if (next !== current) node.nodeValue = next;
}

function normalizeVisibleText(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return /[\u3400-\u9fff]/.test(node.nodeValue ?? "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach(normalizeNodeText);
}

export function EnglishLocaleIntegrityGuard() {
  const { locale } = useLocale();

  useEffect(() => {
    if (locale !== "en") return;
    normalizeVisibleText(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            normalizeNodeText(node as Text);
            return;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            normalizeVisibleText(node as Element);
          }
        });
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          normalizeNodeText(mutation.target as Text);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale]);

  return null;
}
