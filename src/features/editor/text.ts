// 원고 일반 텍스트("\n\n"로 문단 구분) ↔ ProseMirror 문서. DOM 의존 없음.
import type { Node as PMNode } from "@tiptap/pm/model";

export const splitParagraphs = (text: string): string[] => text.replace(/\r\n?/g, "\n").split(/\n{2,}/);

/** Tiptap setContent용 JSON. 빈 문단은 text 없이. */
export function textToDoc(text: string) {
  return {
    type: "doc",
    content: splitParagraphs(text).map((p) => (p ? { type: "paragraph", content: [{ type: "text", text: p }] } : { type: "paragraph" })),
  };
}

/** 문단 텍스트를 "\n\n"으로 이은 저장용 텍스트. */
export function docToText(doc: PMNode): string {
  const parts: string[] = [];
  doc.forEach((p) => parts.push(p.textContent));
  return parts.join("\n\n");
}

/** PM 위치 → 일반 텍스트 문자 위치. 문단 사이 틈은 앞 문단 끝으로 맞춘다. */
export function pmToOffset(doc: PMNode, pos: number): number {
  let base = 0;
  let result = -1;
  doc.forEach((p, start) => {
    if (result >= 0) return;
    const inner = start + 1;
    if (pos <= inner + p.content.size) result = base + Math.max(0, Math.min(pos - inner, p.content.size));
    base += p.content.size + 2;
  });
  return result >= 0 ? result : Math.max(0, base - 2);
}

/** 일반 텍스트 문자 위치 → PM 위치. 문단 사이("\n\n") 위치는 앞 문단 끝으로. */
export function offsetToPm(doc: PMNode, offset: number): number {
  let base = 0;
  let result = -1;
  doc.forEach((p, start) => {
    if (result >= 0) return;
    const inner = start + 1;
    if (offset <= base + p.content.size) result = inner + Math.max(0, offset - base);
    base += p.content.size + 2;
  });
  return result >= 0 ? result : doc.content.size - 1;
}
