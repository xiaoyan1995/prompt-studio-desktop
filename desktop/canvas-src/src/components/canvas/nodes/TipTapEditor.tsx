"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { useEffect, useRef } from "react";

interface TipTapEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  onEditorReady?: (editor: Editor) => void;
  placeholder?: string;
  editable?: boolean;
}

export function TipTapEditor({
  content,
  onUpdate,
  onEditorReady,
  placeholder = "Start creating...",
  editable = false,
}: TipTapEditorProps) {
  const readyFired = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "tiptap ProseMirror prose prose-sm dark:prose-invert max-w-none focus:outline-none nodrag",
        tabindex: "0",
      },
    },
    onUpdate: ({ editor: e }) => {
      onUpdate(e.getHTML());
    },
  });

  useEffect(() => {
    if (editor && !readyFired.current) {
      readyFired.current = true;
      onEditorReady?.(editor);
    }
  }, [editor, onEditorReady]);

  return (
    <div
      className={`flex flex-col w-full h-full min-h-0 relative group p-3 px-4 overflow-y-auto cursor-default ${editable ? "nowheel" : ""}`}
      data-testid="canvas-node-text-content"
    >
      <div className="w-full h-full">
        <EditorContent editor={editor} />
      </div>
      {/* Transparent overlay blocks pointer events when not editable */}
      {!editable && (
        <div className="absolute inset-0" />
      )}
    </div>
  );
}
