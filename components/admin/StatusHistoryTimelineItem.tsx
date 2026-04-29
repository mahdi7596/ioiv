import { StatusBadge } from "./StatusBadge";
import { StatusHistoryNote } from "./StatusHistoryNote";
import { getStatusHistoryDisplay } from "./statusHistoryDisplay";

export type StatusHistoryTimelineItemData = {
  id: string;
  previousStatus?: string | null;
  newStatus: string;
  note?: string | null;
  createdAt: Date;
};

export function StatusHistoryTimelineItem({ item }: { item: StatusHistoryTimelineItemData }) {
  const display = getStatusHistoryDisplay(item);

  return (
    <div className="status-history-timeline__item">
      <span className="status-history-timeline__connector" aria-hidden="true" />
      <div className="status-history-timeline__card">
        <div className="status-history-timeline__transition">
          {item.previousStatus ? <StatusBadge status={item.previousStatus} /> : <span>-</span>}
          <span className="status-history-timeline__joiner">به</span>
          <StatusBadge status={item.newStatus} />
        </div>
        {display.note ? <StatusHistoryNote note={display.note} /> : null}
      </div>
    </div>
  );
}
