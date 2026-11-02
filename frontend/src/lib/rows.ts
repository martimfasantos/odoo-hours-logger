import type { ProposedEntry } from "../api/types";

export const rowKey = (p: ProposedEntry) => `${p.event.uid}|${p.event.start}`;
