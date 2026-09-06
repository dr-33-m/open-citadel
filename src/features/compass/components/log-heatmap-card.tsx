import React from 'react';
import { ScrollView, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { formatCompassDate } from '@/components/compass/format';
import { RowFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { HeatmapChart } from '@/components/ui/heatmap-chart';
import { fontFamily } from '@/constants/theme';
import { buildHeatmapColumns } from '@/features/compass/utils/heatmap-columns';
import type { LogView } from '@/services/occurrences';
import { asColor } from '@/utils/colors';
import { minYmd, type Ymd } from '@/utils/day';

/** The five steps of the heatmap ramp, for the legend under the grid. */
const RAMP_STEPS = [0.12, 0.32, 0.55, 0.78, 1];

/** Hoisted: the same object on every render of every heatmap. */
const COUNT_STYLE = { fontFamily: fontFamily.sansBold } as const;
const SWATCH = { width: 10, height: 10 } as const;

type LogHeatmapCardProps = {
  startDate: Ymd;
  /** The goal's end date. The grid stops at whichever comes first, this or
   *  `upTo`, so a goal's future is never drawn as a field of missed days. */
  endDate: Ymd;
  /** The last day worth drawing: today for a running goal, the day it ended
   *  for one in the archive. */
  upTo: Ymd;
  logsByTrackable: Map<string, LogView[]>;
};

/**
 * The day-by-day shape of a goal: one cell per day, shaded by how much
 * happened on it.
 *
 * The only view in Compass that survives a goal ending unchanged, which is why
 * it lives here rather than inside `InsightsBody`. Every other number about a
 * goal is a ratio with a denominator that keeps moving after the goal stops —
 * consistency, pace, days left — and has to be frozen when the goal is
 * archived. This is not a ratio. It is a record of which days had logs on
 * them, and that is as true a year later as it was the day it was drawn.
 */
export function LogHeatmapCard({
  startDate,
  endDate,
  upTo,
  logsByTrackable,
}: LogHeatmapCardProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const gold = asColor(primary) ?? '#f2ca50';
  const dim = asColor(mutedForeground);

  const columns = React.useMemo(
    () => buildHeatmapColumns(startDate, minYmd(upTo, endDate), logsByTrackable),
    [startDate, endDate, upTo, logsByTrackable],
  );

  const totalLogs = React.useMemo(
    () => columns.reduce((sum, col) => sum + col.bins.reduce((n, b) => n + b.count, 0), 0),
    [columns],
  );

  /**
   * Whether any single day carries more than one log.
   *
   * The ramp encodes how MUCH happened on a day. With one trackable on a fixed
   * schedule a day is logged once or not at all, so five shades carry two
   * states and the LESS/MORE key underneath promises a gradient that cannot
   * exist. Several trackables — or one flexible target logged twice in a day —
   * is when there is a real quantity to shade.
   */
  const graded = React.useMemo(
    () => columns.some((col) => col.bins.some((bin) => bin.count > 1)),
    [columns],
  );

  if (columns.length === 0) return null;

  return (
    <Card>
      <Card.Content className="gap-3 p-4">
        {/* One line: the number bold, the rest of the sentence at the same
            size beside it. Two sizes stacked in three rows spent the card's
            whole top on a figure that reads fine inline, and that height is
            better given to the grid. */}
        <ThemedText type="bodyMd" color={dim}>
          <ThemedText type="bodyMd" style={COUNT_STYLE}>
            {String(totalLogs)}
          </ThemedText>
          {` ${totalLogs === 1 ? 'log' : 'logs'} since ${formatCompassDate(startDate)}`}
        </ThemedText>

        <RowFade surface="popover">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <HeatmapChart
              data={columns}
              layout="fluid"
              binSize={17}
              gap={3}
              cornerRadius={0}
              weekStartDay={1}
              color="--color-primary"
              emptyColor="--color-muted"
              /*
               * Full strength on every logged day when there is no quantity
               * to shade.
               *
               * The ramp takes quartiles of the non-zero counts, so a goal
               * whose days can only ever hold one log derives thresholds of
               * [1,1,1,1] — nudged apart to [1,2,3,4] — and every single cell
               * lands on level one, which is 28% of the colour. A day you
               * turned up for was being drawn at the quietest shade the scale
               * has, while the key beside it drew the same idea at full
               * strength. Flattening the opacities is the whole fix: with
               * nothing to grade, a logged day is simply logged.
               */
              levelOpacity={graded ? undefined : [1, 1, 1, 1, 1]}
            >
              <HeatmapChart.XAxis />
              <HeatmapChart.Cells />
            </HeatmapChart>
          </ScrollView>
        </RowFade>

        {/* Under the grid rather than over it, on the trailing edge. It is a
            key, so it belongs after the thing it explains.

            The ramp is only drawn when a day can hold more than one log. With
            one trackable on a fixed schedule a day is logged once or not at
            all, so five shades named LESS to MORE described a gradient the
            data cannot contain, and a key for a scale that does not exist is
            worse than no key. Then it is two states, and it says so. */}
        <View className="flex-row items-center justify-end gap-1.5">
          {graded ? (
            <>
              <ThemedText type="labelSm" color={dim}>
                LESS
              </ThemedText>
              {RAMP_STEPS.map((opacity) => (
                <View
                  key={opacity}
                  style={[SWATCH, { backgroundColor: gold, opacity }]}
                />
              ))}
              <ThemedText type="labelSm" color={dim}>
                MORE
              </ThemedText>
            </>
          ) : (
            <>
              <View style={[SWATCH, { backgroundColor: gold }]} />
              <ThemedText type="labelSm" color={dim}>
                LOGGED
              </ThemedText>
            </>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}
