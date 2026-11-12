import { Redirect } from "expo-router";

import { Handover } from "@/components/navigation/handover";
import { MemorySkeleton } from "@/features/samwell-memory/components/memory-skeleton";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { SettingsPaneBody } from "@/features/settings/components/settings-pane-body";
import { SettingsPaneSkeleton } from "@/features/settings/components/settings-pane-skeleton";
import { useSettingsPane } from "@/features/settings/hooks/use-settings-pane";
import { PANE_TITLES, paneScrolls } from "@/features/settings/utils/panes";
import { useScreenInteractive } from "@/hooks/use-screen-interactive";

/**
 * One page of Settings, pushed from the list (or straight from elsewhere).
 *
 * Its header is drawn with the press and its controls once the slide has
 * landed, a skeleton standing in while it moves: a page of settings took most
 * of a second to build on a Galaxy A33, which is why the pages used to be
 * built ahead and kept, and building one under a moving screen is what makes
 * the move stall.
 */
export default function SettingsPaneScreen() {
  const { pane, landed, onLeave, onRequestAccount, initialMode } = useSettingsPane();
  const interactive = useScreenInteractive();
  if (!pane) return <Redirect href="/settings" />;

  const scrolls = paneScrolls(pane);
  const skeleton = scrolls ? <SettingsPaneSkeleton /> : <MemorySkeleton />;

  return (
    <SettingsPage title={PANE_TITLES[pane]} leaves="back" onLeave={onLeave} scrolls={scrolls}>
      <Handover onShown={interactive} skeleton={skeleton} ready={landed} fill={!scrolls}>
        <SettingsPaneBody pane={pane} onRequestAccount={onRequestAccount} initialMode={initialMode} />
      </Handover>
    </SettingsPage>
  );
}
