// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import m0000 from "./0000_magical_starjammers.js";
import m0001 from "./0001_loose_inhumans.js";
import m0002 from "./0002_easy_pet_avengers.js";
import m0003 from "./0003_productive_the_executioner.js";
import m0004 from "./0004_nervous_liz_osborn.js";
import m0005 from "./0005_bookmark_note.js";
import journal from "./meta/_journal.json";

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
  },
};
