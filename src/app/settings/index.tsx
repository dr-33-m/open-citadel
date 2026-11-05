import { CreatorNoteSheet } from "@/components/settings/creator-note-sheet";
import { ThemeScope } from "@/components/theme-scope";
import { SettingsHome } from "@/features/settings/components/settings-home";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { useSettingsHome } from "@/features/settings/hooks/use-settings-home";
import { THEME_ORDER } from "@/utils/theme-order";

/**
 * Settings: a short list of what there is to set, each row saying what it is
 * set to, and each row's controls a page of their own (`settings/[pane]`).
 *
 * Built the way Bluesky and Expensify build theirs: the list is a screen, and
 * every page is a screen pushed from it, built when opened and gone when left.
 * It used to be one screen holding every page, each built ahead while hidden
 * and kept: opening Settings then built all five in the background (up to a
 * second at a time with presses waiting on it, on a Galaxy A33), and closing
 * it tore all five down, a 1.3 second freeze. Now opening draws the list and
 * closing removes the list.
 */
export default function SettingsScreen() {
  const screen = useSettingsHome();

  return (
    <>
      {/* The theme switch is on this page: it takes a new theme with the press. */}
      <ThemeScope order={THEME_ORDER.now}>
        <SettingsPage title="Settings" leaves="down" onLeave={screen.close}>
          <SettingsHome {...screen.home} />
        </SettingsPage>
      </ThemeScope>
      <CreatorNoteSheet {...screen.note} />
    </>
  );
}
