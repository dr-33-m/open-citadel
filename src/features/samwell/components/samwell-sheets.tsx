import React from 'react';

import { PlansSheetHost } from '@/features/billing/components/plans-sheet';
import { ArticlePickerSheet } from '@/features/blogs/components/article-picker-sheet';
import { BookPickerSheet } from '@/features/chat/components/book-picker-sheet';
import { BrainSheetHost } from '@/features/chat/components/brain-sheet-host';
import { ChatHistorySheet } from '@/features/chat/components/chat-history-sheet';
import { AboutCompassSheet } from '@/features/compass/components/about-compass-sheet';
import { InsightsSheet } from '@/features/compass/components/insights-sheet';
import { LogDeckSheet } from '@/features/compass/components/log-deck-sheet';
import { OverviewSheet } from '@/features/compass/components/overview-sheet';
import { PastGoalsSheet } from '@/features/compass/components/past-goals-sheet';
import { PlannerSheet } from '@/features/compass/components/planner-sheet';
import { EpisodePickerSheet } from '@/features/podcasts/components/episode-picker-sheet';
import { TranscriptViewer } from '@/features/podcasts/components/episode-transcript-sheets';
import { brainSheet, plansSheet } from '@/features/samwell/handles';
import {
  useArticlePickerSheet,
  useBookPickerSheet,
  useChatHistorySheet,
  useEpisodePickerSheet,
  useEpisodeTranscriptSheet,
} from '@/features/samwell/hooks/use-chat-sheets';
import { useCompassGoalSheets, usePlannerSheet } from '@/features/samwell/hooks/use-compass-sheets';
import { useBrainSheetCloud, useStartInCloud } from '@/features/samwell/hooks/use-samwell-brains';
import { useSamwellSheet, useSheetAsked, type SamwellSheet } from '@/stores/samwell-ui';

/**
 * Mounts a sheet the first time it is asked for, and keeps it from then on.
 *
 * A closed sheet's modal is already left out by `Sheet`, but its wiring was
 * not: the history lists, the goal stores and the pickers' queries were all
 * subscribed from the page's first frame, for sheets most visits never open.
 * This holds only the one flag, so nothing under it runs until then.
 */
function WhenOpened({ sheets, children }: { sheets: readonly SamwellSheet[]; children: React.ReactNode }) {
  const asked = useSheetAsked(sheets);
  const [opened, setOpened] = React.useState(asked);
  if (asked && !opened) setOpened(true);
  return opened ? children : null;
}

const BookPicker = () => <BookPickerSheet {...useBookPickerSheet()} />;
const ArticlePicker = () => <ArticlePickerSheet {...useArticlePickerSheet()} />;
const EpisodePicker = () => <EpisodePickerSheet {...useEpisodePickerSheet()} />;
const ChatHistory = () => <ChatHistorySheet {...useChatHistorySheet()} />;
const EpisodeTranscript = () => <TranscriptViewer {...useEpisodeTranscriptSheet()} />;
const LogDeck = () => <LogDeckSheet {...useSamwellSheet('deck')} />;
const Planner = () => <PlannerSheet {...usePlannerSheet()} />;
const AboutCompass = () => <AboutCompassSheet {...useSamwellSheet('about-compass')} />;

function GoalSheets() {
  const { insights, overview, pastGoals } = useCompassGoalSheets();
  return (
    <>
      <InsightsSheet {...insights} />
      <OverviewSheet {...overview} />
      <PastGoalsSheet {...pastGoals} />
    </>
  );
}

function Hosts() {
  const cloud = useBrainSheetCloud();
  const startInCloud = useStartInCloud();
  return (
    <>
      <PlansSheetHost ref={plansSheet} line="Monthly Neurons for Samwell's cloud brains." onActivated={startInCloud} />
      <BrainSheetHost ref={brainSheet} cloud={cloud} />
    </>
  );
}

const GOAL_SHEETS = ['insights', 'overview', 'past-goals'] as const;

/**
 * Every sheet the Samwell page raises, each subscribed to its own flag.
 *
 * Takes no props and reads nothing itself, so the page drawing again never
 * reaches it, and one sheet opening draws that sheet alone.
 */
export const SamwellSheets = React.memo(function SamwellSheets() {
  return (
    <>
      <WhenOpened sheets={['book']}><BookPicker /></WhenOpened>
      <WhenOpened sheets={['post']}><ArticlePicker /></WhenOpened>
      <WhenOpened sheets={['episode']}><EpisodePicker /></WhenOpened>
      <WhenOpened sheets={['history']}><ChatHistory /></WhenOpened>
      <WhenOpened sheets={['episode-transcript']}><EpisodeTranscript /></WhenOpened>
      <WhenOpened sheets={['deck']}><LogDeck /></WhenOpened>
      <WhenOpened sheets={['planner']}><Planner /></WhenOpened>
      <WhenOpened sheets={GOAL_SHEETS}><GoalSheets /></WhenOpened>
      <WhenOpened sheets={['about-compass']}><AboutCompass /></WhenOpened>
      {/* Raised through handles, from the plan wall and the toolbox. */}
      <Hosts />
    </>
  );
});
