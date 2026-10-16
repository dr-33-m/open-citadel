import { Copy, Highlighter, MessageSquare } from "@/components/icons";
import React from "react";

import { ActionStrip } from "@/components/action-strip";

type SelectionBarProps = {
  onHighlight: () => void;
  onCopy: () => void;
  onChat: () => void;
  selectedText: string;
  chatLoading?: boolean;
};

/** What a passage selected in the reader can become: a highlight, a copy, a chat. */
export function SelectionBar({ onHighlight, onCopy, onChat, chatLoading = false }: SelectionBarProps) {
  return (
    <ActionStrip>
      <ActionStrip.Action icon={Highlighter} label="Highlight" primary onPress={onHighlight} />
      <ActionStrip.Action icon={Copy} label="Copy" onPress={onCopy} />
      <ActionStrip.Action icon={MessageSquare} label="Chat" busy={chatLoading} onPress={onChat} />
    </ActionStrip>
  );
}
