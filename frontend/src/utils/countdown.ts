export function formatTimeLeft(seconds: number): string {
  if (seconds < 60) return "<1 min";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}
