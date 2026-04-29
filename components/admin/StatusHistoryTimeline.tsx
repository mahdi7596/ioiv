import {
  StatusHistoryTimelineItem,
  type StatusHistoryTimelineItemData,
} from "./StatusHistoryTimelineItem";

type StatusHistoryGroup = {
  dateLabel: string;
  dateTime: string;
  items: StatusHistoryTimelineItemData[];
};

function groupHistoryByDate(items: StatusHistoryTimelineItemData[]) {
  const groups: StatusHistoryGroup[] = [];

  for (const item of items) {
    const dateLabel = item.createdAt.toLocaleDateString("fa-IR");
    const existing = groups.find((group) => group.dateLabel === dateLabel);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({
        dateLabel,
        dateTime: item.createdAt.toISOString(),
        items: [item],
      });
    }
  }

  return groups;
}

export function StatusHistoryTimeline({ items }: { items: StatusHistoryTimelineItemData[] }) {
  const groups = groupHistoryByDate(items);

  return (
    <div className="status-history-timeline">
      <span className="status-history-timeline__rail" aria-hidden="true" />
      {groups.map((group) => (
        <section className="status-history-timeline__group" key={group.dateLabel}>
          <div className="status-history-timeline__date-row">
            <span className="status-history-timeline__node" aria-hidden="true" />
            <time className="status-history-timeline__date-marker" dateTime={group.dateTime}>
              {group.dateLabel}
            </time>
          </div>
          <div className="status-history-timeline__entries">
            {group.items.map((item) => (
              <StatusHistoryTimelineItem key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
