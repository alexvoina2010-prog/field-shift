# How AI was used to build BioShift

BioShift was built by one person, Alex, for the 2026 NASA Space Apps Challenge ("Field Shift: Adapting Farms with NASA Data"). The only AI tools used were **Claude Code** (Anthropic's AI coding assistant) and the sub-agents it runs. This file says what Alex decided and what the AI produced, so judges can see both.

## What is Alex's

- **The idea.** Decades of NASA weather records exist for every field on Earth, so a farmer can see the most likely outcome of a crop rotation by replaying it against the weather that actually happened, before risking a real season. The AI did not propose the idea or the approach.
- **The product decisions:** the name BioShift, the design direction, the five farmer priorities (more profit, steadier income in bad years, less work and machinery, healthier soil, use less water), and the whole money and profit system (yield on replayed weather, profit in a normal and a bad year, years with a loss).
- **Direction of every change.** Each feature and both redesigns started from Alex's explanation of what was wrong or missing. Alex worked in a structured way: an audit of the first version before any code changed, a phased plan with time targets and cut rules, written must / must-not rules for the AI (for example: no yields or profit stated as facts, every unsourced crop value labelled "assumption", no trend called significant without a test, no "AI recommends" wording), and a commit after every phase.
- **Testing on a phone.** Alex tested the app by hand on a phone.

## What the AI did

- **Turned Alex's explanations into specifications.** For almost every change, Claude Code either wrote a detailed prompt (a "master prompt") from Alex's explanation, or asked Alex questions until the requirement was clear. Alex then approved or corrected it.
- **Wrote the code:** the HTML, CSS and JavaScript, the model in `src/model/`, and the data script.
- **Wrote the automated tests** (25, run with `node --test`), including the FAO-56 worked example for evapotranspiration.
- **Read parameter values from published sources:** crop coefficients, stage lengths, rooting depths and soil water from the FAO-56 tables, and Ky values from FAO Paper 66. Each value carries its source in `data/crops.json`; values without one are labelled "assumption" in the app.
- **Chose the example prices, yields and costs** that the money system starts with. They are labelled "Example values, change them to yours" and marked `"illustrative"` in `data/crops.json`.
- **Drew the images that are not photographs:** the crop, soil, terrain, irrigation, goal and scenario icons (`js/icons.js`), the logo mark and the favicon, all as simple SVG code. They are marked as AI-generated in their files and in the site footer.
- **Drafted text:** the documentation, the in-app explanations, the submission text and the video script, from numbers the app computes. Claude also found the public source for the 2024 Romanian drought figure by web search.
- **Reviewed code** with its review sub-agents, and fixed what they found.

## What AI did not do

- **No AI runs inside the app.** Every result comes from NASA data and published formulas (FAO-56, FAO-33/66, USDA TR-55, Mann-Kendall). There is no chatbot and no model call.
- **Demo video:** a screen recording of the real app with title cards and subtitles. Claude Code wrote the recording and editing scripts (`demo/`, Playwright and ffmpeg) and the card text; every frame carries an "AI-generated media" label. No generated imagery, voice or audio.
- **No AI-generated photographs, video, audio or voice** are in the app. The one photograph is a credited Wikimedia Commons image (CC BY-SA 4.0).
- **No NASA logos, insignia or mission identifiers** were generated, used or modified.

## Where this is disclosed

- **On the site:** a line in the footer of every page, linking here, and an `ai-disclosure` meta tag in `index.html`.
- **In the code:** a header comment in every source file, and a separate comment on the AI-drawn icons (`js/icons.js`, `favicon.svg`).
- **In the data:** an `_ai_note` field in `data/crops.json`. `data/demo_field.json` is NASA POWER data saved unchanged by a script.
- **In the package metadata:** the `aiDisclosure` field in `package.json`.
- **In the README** and `REFERENCES.md`.
