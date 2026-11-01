
import { KeptAlive } from "@/components/kept-alive";
import type { EngineMode } from "@/components/settings/engine-info-sheet";
import { ThemeScope } from "@/components/theme-scope";
import { ViewSwitcher } from "@/components/view-switcher";
import { PodcastSettings } from "@/features/podcasts/components/podcast-settings-section";
import { AccountCard } from "@/features/settings/components/account-card";
import { DisplayNameCard } from "@/features/settings/components/display-name-card";
import { SamwellSection } from "@/features/settings/components/samwell-section";
import {
    SettingsHome,
    type SettingsHomeProps,
} from "@/features/settings/components/settings-home";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { SamwellMemoryPane } from "@/features/samwell-memory/components/samwell-memory-pane";
import {
    PANE_TITLES,
    SETTINGS_PANES,
    type SettingsPane,
} from "@/features/settings/utils/panes";
import { TtsSettingsPanel } from "@/features/tts/components/tts-settings-panel";
import { THEME_ORDER, settingsPaneOrder } from "@/utils/theme-order";

export type SettingsPanesProps = {
  /** The pane showing, or null for the list. */
  pane: SettingsPane | null;
  /** The panes to build before they are opened. */
  warm: Record<SettingsPane, boolean>;
  home: SettingsHomeProps;
  samwell: { onRequestAccount: () => void; initialMode?: EngineMode };
  onLeave: () => void;
};

const PAGE_ORDER = ["home", ...SETTINGS_PANES] as const;

/*
 * The panes that take nothing from the screen, made once. The screen draws
 * again on every press (the pane showing changed), and an element that is the
 * same object as last time is one React does not draw again: so a press
 * redraws the list and Samwell's props, and none of these.
 */
const PROFILE = (
  <>
    {/* The display name first because everyone has one and it needs
        nothing; the account under it because it is optional. */}
    <DisplayNameCard />
    <AccountCard />
  </>
);
const VOICE = <TtsSettingsPanel warm />;
const PODCASTS = <PodcastSettings />;
const MEMORY = <SamwellMemoryPane />;

/**
 * The body of Settings: the list, and each pane under it, in one place and
 * one at a time. Each is kept once built, and the ones not yet opened are
 * built ahead while hidden, so a press on a row reveals a pane that is already
 * there (`KeptAlive`).
 */
export function SettingsPanes({
  pane,
  warm,
  home,
  samwell,
  onLeave,
}: SettingsPanesProps) {
  // Each page is a theme scope of its own, header and all, side by side: the
  // page showing takes a new theme with the press, and the ones hidden take
  // it last. One scope round the lot would have had the hidden panes run
  // again with the list (`components/theme-scope`).
  const orders = {
    profile: settingsPaneOrder(0, pane === "profile"),
    samwell: settingsPaneOrder(1, pane === "samwell"),
    voice: settingsPaneOrder(2, pane === "voice"),
    podcasts: settingsPaneOrder(3, pane === "podcasts"),
    memory: settingsPaneOrder(4, pane === "memory"),
  };
  const pages = {
    home: (
      <ThemeScope order={THEME_ORDER.now}>
        <SettingsPage
          title="Settings"
          leaves="down"
          onLeave={onLeave}
          active={pane === null}
        >
          <KeptAlive active={pane === null} visible warm>
            <SettingsHome {...home} />
          </KeptAlive>
        </SettingsPage>
      </ThemeScope>
    ),
    profile:
      warm.profile || pane === "profile" ? (
        <ThemeScope order={orders.profile}>
          <SettingsPage
            title={PANE_TITLES.profile}
            leaves="back"
            onLeave={onLeave}
            active={pane === "profile"}
          >
            <KeptAlive
              active={pane === "profile"}
              visible
              warm={warm.profile}
              className="gap-4"
            >
              {PROFILE}
            </KeptAlive>
          </SettingsPage>
        </ThemeScope>
      ) : null,
    samwell:
      warm.samwell || pane === "samwell" ? (
        <ThemeScope order={orders.samwell}>
          <SettingsPage
            title={PANE_TITLES.samwell}
            leaves="back"
            onLeave={onLeave}
            active={pane === "samwell"}
          >
            <KeptAlive active={pane === "samwell"} visible warm={warm.samwell}>
              <SamwellSection {...samwell} />
            </KeptAlive>
          </SettingsPage>
        </ThemeScope>
      ) : null,
    voice:
      warm.voice || pane === "voice" ? (
        <ThemeScope order={orders.voice}>
          <SettingsPage
            title={PANE_TITLES.voice}
            leaves="back"
            onLeave={onLeave}
            active={pane === "voice"}
          >
            <KeptAlive active={pane === "voice"} visible warm={warm.voice}>
              {VOICE}
            </KeptAlive>
          </SettingsPage>
        </ThemeScope>
      ) : null,
    podcasts:
      warm.podcasts || pane === "podcasts" ? (
        <ThemeScope order={orders.podcasts}>
          <SettingsPage
            title={PANE_TITLES.podcasts}
            leaves="back"
            onLeave={onLeave}
            active={pane === "podcasts"}
          >
            <KeptAlive active={pane === "podcasts"} visible warm={warm.podcasts}>
              {PODCASTS}
            </KeptAlive>
          </SettingsPage>
        </ThemeScope>
      ) : null,
    memory:
      warm.memory || pane === "memory" ? (
        <ThemeScope order={orders.memory}>
          {/* Not scrolled by the page: it is a list, and scrolls itself. */}
          <SettingsPage
            title={PANE_TITLES.memory}
            leaves="back"
            onLeave={onLeave}
            active={pane === "memory"}
            scrolls={false}
          >
            <KeptAlive active={pane === "memory"} visible warm={warm.memory} className="flex-1">
              {MEMORY}
            </KeptAlive>
          </SettingsPage>
        </ThemeScope>
      ) : null,
  };

  return (
    <ViewSwitcher
      order={PAGE_ORDER}
      value={pane ?? "home"}
      sides={pages}
      page
    />
  );
}
