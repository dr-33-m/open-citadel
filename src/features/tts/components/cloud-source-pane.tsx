import React from 'react';
import { View } from 'react-native';
import type { PlanId } from 'samwell-shared';

import { SwitchPanes } from '@/components/switch-panes';
import { PlanCheckCard } from '@/features/billing/components/plan-check-card';
import { CloudSampleActions } from '@/features/tts/components/cloud-sample-actions';
import { CloudVoicePane, type CloudVoicePaneProps } from '@/features/tts/components/cloud-voice-pane';
import { CloudVoicePlans, type CloudVoicePlansProps } from '@/features/tts/components/cloud-voice-plans';
import type { CloudPaneView } from '@/features/tts/utils/cloud-voices';

/**
 * Left to right as a reader moves through them: the wait, the plans, and the
 * voices a step deeper. So the voices arrive from the right whether a plan
 * was bought or is being sampled, and going back to the plans leaves the way
 * they came.
 */
const ORDER: readonly CloudPaneView[] = ['checking', 'unreachable', 'plans', 'voices'];

export interface CloudSourcePaneProps {
  view: CloudPaneView;
  /** The plans are on sale to this reader, so their pane is kept while a plan is sampled. */
  selling: boolean;
  voices: CloudVoicePaneProps;
  plans: CloudVoicePlansProps;
  /** A plan's voices are being heard before it is bought: which, and the way back to the plans. */
  sampling: { plan: PlanId; onBack: () => void } | null;
  /** Asks the server again, when it never answered whether a plan is held. */
  onRetry: () => void;
  /** Build what is not showing while it is hidden. See `KeptAlive`. */
  warm?: boolean;
}

/**
 * What is under the Cloud card: its voices, or what stands in for them until
 * a plan is held. The plans on sale for a reader without one, the same way
 * Samwell's own Cloud card shows them; a quiet card while that is being
 * asked, so a reader who is paying is never shown prices.
 *
 * From the plans a reader can hear a plan's voices before buying it. The
 * voices pane is then the one a subscriber has, drawn for that plan, with the
 * way to buy and the way back under it (`CloudSampleActions`). The plans stay
 * where they were left behind it, and the two trade places as the panes under
 * a switch do (`SwitchPanes`). Buying takes nothing away but the buttons.
 */
export function CloudSourcePane({ view, selling, voices, plans, sampling, onRetry, warm = false }: CloudSourcePaneProps) {
  // Kept while a sampled plan's voices leave for the plans, not only while they show.
  const hasVoices = view === 'voices' || sampling !== null;

  return (
    <SwitchPanes
      order={ORDER}
      value={view}
      warm={warm}
      panes={{
        checking: view === 'checking' ? <PlanCheckCard /> : null,
        unreachable: view === 'unreachable' ? <PlanCheckCard unreachable onRetry={onRetry} /> : null,
        plans: selling ? <CloudVoicePlans {...plans} /> : null,
        voices: hasVoices ? (
          <View className="gap-6">
            <CloudVoicePane {...voices} />
            {sampling ? <CloudSampleActions plan={sampling.plan} onBack={sampling.onBack} /> : null}
          </View>
        ) : null,
      }}
    />
  );
}
