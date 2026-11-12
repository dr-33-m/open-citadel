import { InfoSheet, type InfoContent } from "@/components/info-sheet";

export type EngineMode = "offline" | "cloud";

const CONTENT: Record<EngineMode, InfoContent> = {
  offline: {
    label: "OFFLINE",
    title: "Samwell on your device.",
    points: [
      "He runs entirely on your device. Nothing you say leaves your phone.",
      "Works anywhere, with no internet.",
      "No usage limits, and free.",
      "He is bound by your phone, so he uses a smaller brain than the cloud.",
      "Compass is not available offline.",
    ],
    notice: {
      title: "Best for chat",
      body: "On-device brains are good at conversation, but may struggle to do things for you in Open Citadel. To use everything it offers, switch to Samwell Cloud.",
    },
  },
  cloud: {
    label: "CLOUD",
    title: "Samwell in the cloud.",
    points: [
      "In the Cloud, Samwell has three expert levels to choose from: Maester, Grand Maester and Archmaester.",
      "Deeper thinking and sharper insight than any phone can manage.",
      "Compass only available here, with Samwell cloud.",
      "What you ask, and the passages of your reading he needs to answer, are sent through Open Citadel to the brain's maker. Only what each request needs.",
      "Needs an internet connection.",
    ],
  },
};

/** What the "i" on Samwell's on-device and cloud cards opens. */
export function EngineInfoSheet({
  mode,
  onClose,
}: {
  mode: EngineMode | null;
  onClose: () => void;
}) {
  return <InfoSheet visible={mode !== null} onClose={onClose} info={mode ? CONTENT[mode] : null} />;
}
