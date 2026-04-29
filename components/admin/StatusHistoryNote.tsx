import { MessageSquareText } from "lucide-react";

export function StatusHistoryNote({ note }: { note: string }) {
  return (
    <p className="status-history-note mt-2">
      <MessageSquareText
        aria-hidden="true"
        className="status-history-note__icon"
        size={16}
        strokeWidth={1.8}
      />
      <span>{note}</span>
    </p>
  );
}
