// 화면 전용 표시(저장되지 않음): AI가 방금 쓴 덩어리, 선택 수정 비교(취소선+초록 밑줄).
import { Extension, type Editor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Hunk } from "./docDiff";

type Range = { from: number; to: number };
type AiBlockState = { range: Range | null; show: boolean };
type DiffState = { range: Range; candidate: string; insert: boolean } | null;

const blockKey = new PluginKey<AiBlockState>("aiBlock");
const diffKey = new PluginKey<DiffState>("aiDiff");
const docDiffKey = new PluginKey<Hunk[] | null>("aiDocDiff");

export const AiMarks = Extension.create({
  name: "aiMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin<AiBlockState>({
        key: blockKey,
        state: {
          init: () => ({ range: null, show: false }),
          apply(tr, value) {
            const meta = tr.getMeta(blockKey) as AiBlockState | undefined;
            if (meta) return meta;
            if (!tr.docChanged || !value.range) return value;
            const from = tr.mapping.map(value.range.from, 1);
            const to = tr.mapping.map(value.range.to, -1);
            return { ...value, range: from < to ? { from, to } : null };
          },
        },
        props: {
          decorations(state) {
            const v = blockKey.getState(state);
            if (!v?.range) return null;
            const cls = v.show ? "ai-block" : "ai-block ai-block-faded";
            return DecorationSet.create(state.doc, [Decoration.inline(v.range.from, v.range.to, { class: cls })]);
          },
        },
      }),
      new Plugin<DiffState>({
        key: diffKey,
        state: {
          init: () => null,
          apply: (tr, value) => (tr.getMeta(diffKey) !== undefined ? (tr.getMeta(diffKey) as DiffState) : value),
        },
        props: {
          decorations(state) {
            const v = diffKey.getState(state);
            if (!v) return null;
            const deco: Decoration[] = [];
            if (!v.insert && v.range.from < v.range.to) deco.push(Decoration.inline(v.range.from, v.range.to, { class: "ai-del" }));
            deco.push(
              Decoration.widget(
                v.range.to,
                () => {
                  const el = document.createElement("span");
                  el.className = "ai-add";
                  el.textContent = v.candidate;
                  return el;
                },
                { side: 1, key: v.candidate },
              ),
            );
            return DecorationSet.create(state.doc, deco);
          },
        },
      }),
      // 문체·노트 전체 고치기: 바뀐 문단은 취소선, 새 문단은 그 아래 초록 밑줄
      new Plugin<Hunk[] | null>({
        key: docDiffKey,
        state: {
          init: () => null,
          apply: (tr, value) => (tr.getMeta(docDiffKey) !== undefined ? (tr.getMeta(docDiffKey) as Hunk[] | null) : value),
        },
        props: {
          decorations(state) {
            const hunks = docDiffKey.getState(state);
            if (!hunks) return null;
            const starts: number[] = []; // 문단 i의 앞 경계
            state.doc.forEach((_p, off) => starts.push(off));
            const bound = (i: number) => (i < starts.length ? starts[i] : state.doc.content.size);
            const deco: Decoration[] = [];
            hunks.forEach((h, k) => {
              if (h.del) deco.push(Decoration.inline(bound(h.at) + 1, bound(h.at + h.del) - 1, { class: "ai-del" }));
              const paras = h.add.filter(Boolean);
              if (paras.length)
                deco.push(
                  Decoration.widget(
                    bound(h.at + h.del),
                    () => {
                      const box = document.createElement("div");
                      box.className = "ai-add-block";
                      for (const t of paras) {
                        const el = document.createElement("span");
                        el.className = "ai-add";
                        el.textContent = t;
                        box.append(el);
                      }
                      return box;
                    },
                    { side: -1, key: `${k}:${paras.join("\n")}` },
                  ),
                );
            });
            return DecorationSet.create(state.doc, deco);
          },
        },
      }),
    ];
  },
});

export const getAiBlock = (editor: Editor) => blockKey.getState(editor.state)?.range ?? null;
export const setAiBlock = (editor: Editor, range: Range | null, show = true) =>
  editor.view.dispatch(editor.state.tr.setMeta(blockKey, { range, show }).setMeta("addToHistory", false));
export const fadeAiBlock = (editor: Editor) => {
  const v = blockKey.getState(editor.state);
  if (v?.range && v.show) setAiBlock(editor, v.range, false);
};
export const setDiff = (editor: Editor, diff: DiffState) =>
  editor.view.dispatch(editor.state.tr.setMeta(diffKey, diff).setMeta("addToHistory", false));

export const setDocDiff = (editor: Editor, hunks: Hunk[] | null) =>
  editor.view.dispatch(editor.state.tr.setMeta(docDiffKey, hunks).setMeta("addToHistory", false));

/** [from,to]를 text(문단은 빈 줄 기준)로 바꾼다. 새 글이 차지하는 끝 위치를 돌려준다. */
export function replaceWithText(editor: Editor, from: number, to: number, text: string, aiBlock = false): number {
  const { state } = editor;
  const { paragraph } = state.schema.nodes;
  const paras = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => paragraph.create(null, p ? state.schema.text(p) : undefined));
  const tr = state.tr.replace(from, to, new Slice(Fragment.from(paras), 1, 1));
  const end = tr.mapping.map(to);
  if (aiBlock) tr.setMeta(blockKey, { range: { from, to: end }, show: true });
  editor.view.dispatch(tr);
  return end;
}

/** 끝에 이어 쓸 자리를 만든다(마지막 문단이 비어 있지 않으면 빈 문단 추가). 글자 위치를 돌려준다. */
export function openTail(editor: Editor): number {
  const { state } = editor;
  const last = state.doc.lastChild!;
  if (last.content.size > 0) {
    editor.view.dispatch(state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create()));
  }
  return editor.state.doc.content.size - 1;
}
