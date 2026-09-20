export default function Loading() {
  return (
    <div className="loading-state" role="status" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      <div className="metrics-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
