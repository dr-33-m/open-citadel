import React from 'react';
import { View } from 'react-native';

import { BookOpen, Check, CircleAlert, CircleX, Globe, Library, Search } from '@/components/icons';
import { Shimmer } from '@/components/ui/shimmer';
import { Task, type TaskStatus } from '@/components/ui/task';
import { Text } from '@/components/ui/text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { asColor } from '@/utils/colors';
import type { StepStatus, TurnStep } from '@/utils/turn-activity';

const ICON = 14;
/** Task's own title style, for the headers drawn here without its chevron. */
const TITLE = 'text-sm text-muted-foreground';
const TITLE_FILL = `flex-1 ${TITLE}`;

/** What a running step is drawn with: the kind of work, since it has no outcome yet. */
function WorkIcon({ tool, color }: { tool: string; color: string | undefined }) {
  if (tool === 'web_search') return <Globe size={ICON} color={color} />;
  if (tool === 'read_chapter' || tool === 'list_chapters' || tool === 'search_reading') return <BookOpen size={ICON} color={color} />;
  if (tool.startsWith('search_')) return <Search size={ICON} color={color} />;
  return <Library size={ICON} color={color} />;
}

/**
 * PanelUI's `Task` has four states and draws `error` in the destructive red.
 * A step that failed or was declined is not an alarm here (a failure the
 * reader must act on is a toast, never red text), so every finished step is
 * `complete` to Task and the glyph says how it ended, muted like every status
 * mark in the app.
 */
const TASK_STATUS: Record<StepStatus, TaskStatus> = {
  running: 'running',
  done: 'complete',
  failed: 'complete',
  declined: 'complete',
};

function StepGlyph({ step, color }: { step: TurnStep; color: string | undefined }) {
  if (step.status === 'running') return <WorkIcon tool={step.tool} color={color} />;
  const Glyph = step.status === 'done' ? Check : step.status === 'declined' ? CircleX : CircleAlert;
  return <Glyph size={ICON} color={color} />;
}

const TrailStep = React.memo(function TrailStep({ step, muted }: { step: TurnStep; muted: string | undefined }) {
  const icon = <StepGlyph step={step} color={muted} />;
  if (!step.detail) {
    // Nothing to fold away, so no chevron promising there is: the header alone.
    return (
      <Task status={TASK_STATUS[step.status]}>
        <Task.Trigger disabled accessibilityRole="text">
          {icon}
          {step.status === 'running' ? (
            <View className="flex-1">
              <Shimmer textClassName={TITLE}>{step.title}</Shimmer>
            </View>
          ) : (
            <Text numberOfLines={2} className={TITLE_FILL}>
              {step.title}
            </Text>
          )}
        </Task.Trigger>
      </Task>
    );
  }
  return (
    <Task status={TASK_STATUS[step.status]}>
      <Task.Trigger title={step.title} icon={icon} />
      <Task.Content>
        <Task.Item>{step.detail}</Task.Item>
      </Task.Content>
    </Task>
  );
});

/**
 * What Samwell did on the way to his answer, one step to a row: looking a
 * book up, searching the web, reading a chapter, queueing a book. The step
 * still under way shimmers; finished ones say what came of them on the line
 * beneath. Drawn above the reply it led to, and kept with it.
 */
export const TurnTrail = React.memo(function TurnTrail({ steps }: { steps: readonly TurnStep[] }) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  if (steps.length === 0) return null;
  return (
    <View className="gap-1.5 pb-2" accessibilityLabel="What Samwell did">
      {steps.map((step) => (
        <TrailStep key={step.id} step={step} muted={muted} />
      ))}
    </View>
  );
});
