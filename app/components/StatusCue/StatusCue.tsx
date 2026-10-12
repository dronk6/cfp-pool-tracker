/**
 * The word that marks a message as an error or a warning, so it doesn't rely on color alone
 * (red and orange are hard to tell apart). Hidden from assistive technology: the message
 * already has its own role or heading, and this keeps accessible names and text unchanged.
 */
export default function StatusCue({ kind }: { kind: "error" | "warning" }) {
  return <span aria-hidden="true">{kind === "error" ? "Error: " : "Warning: "}</span>;
}
