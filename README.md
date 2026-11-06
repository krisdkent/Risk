# Frontline Legacy v0.1

Original local Risk Legacy-inspired React Native prototype. Not affiliated with Hasbro or Risk.

## Run on iPhone without a developer account
1. Install **Expo Go** from the App Store.
2. On a computer or tablet browser, open https://snack.expo.dev .
3. Replace `App.js` with the supplied `App.js` source.
4. In Snack's dependencies panel, add `react-native-svg` and `@react-native-async-storage/async-storage` if they're not already installed. Both are included in Expo Go.
5. Choose **My Device** and scan the QR code using Expo Go / iPhone camera.
6. Save the Snack to your Expo account for future sessions. The operation saves locally on the current device through AsyncStorage.

You can also edit Snack on your iPhone using Safari (request desktop site if necessary), but using a second screen makes copying code/QR onboarding significantly easier. On a single phone, use Expo Go's option to open a saved Snack or Expo link.

## Features
- 24 original territories / 3 continent groups / 5 factions
- Pass-and-play 2–5 commanders or 1 human vs 1–4 computer commanders
- Recruit, attack (3 vs 2 dice), maneuver, earn stars from captured HQs
- 4-star victory, permanent campaign scars and founder's city for winner
- Local auto-save and subsequent operations

## Known prototype limitations
- The map is an original schematic region grid, not the official world map, and isn't geographically accurate.
- Simplified rules: no resource-card market, star purchasing, starting faction powers, full scar-card actions, event envelopes or initial territory draft.
- Computer AI is a lightweight local heuristic; not networked multiplayer.
- Tap zoom +/- and scroll; gesture pinch-to-zoom is not implemented yet.
- Untested on a physical iPhone in this environment.

## Architecture next steps
- Extract game engine into pure state transition modules and add deterministic seeded dice with unit tests.
- Add 42 territories, proper borders, 6 continents and ocean connections with a custom original map.
- Implement digital resource market, original faction powers, progressively revealed campaign content.
- Add turn confirmation screen for pass-and-play, saved game slots, and optional online lobbies with authenticated state authority.
