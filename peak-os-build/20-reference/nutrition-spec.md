# Nutrition Spec (L3) — full MyFitnessPal Premium+ parity

The nutrition module matches everything MFP's Premium+ tier does, then adds
carb-cycle auto-switching MFP can't. Built in Stage 6.

## Food logging — four methods
1. **Barcode scanner.** Camera via getUserMedia in iOS Safari PWA -> decode
   barcode -> look up in Open Food Facts (free, ~3M+ products, no API key,
   no backend). Cache hits into the `foods` store.
2. **Search.** Text search against Open Food Facts + the local cache +
   custom foods. Show a "best match" first.
3. **Voice log.** Web Speech API (browser-native, free) -> parse spoken text
   -> return candidate foods + servings for review before logging.
4. **Meal scan (AI photo).** Photo -> the 10% AI identifies foods + estimates
   portions -> user reviews/edits before logging. Free path = copy-to-Claude
   with the image; API-key path automates it. AI estimates, the 60% sums.

## Database & items
- Open Food Facts as the source; custom food creation (enter your own macros);
  recipe creation (combine foods into one loggable item); recipe URL import is a
  later nice-to-have. Favorites for fast re-logging.

## Daily diary
- Slots: Breakfast, Lunch, Dinner, Snacks (+ custom slots / rename).
- Per-meal subtotal: calories + P/C/F.
- Per-item: serving size + quantity, full macro + micro contribution.
- Food timestamps (when logged).
- Quick-add macros (enter totals without searching).
- Copy a meal/day forward to another date.

## Macros & micros
- Daily targets in grams for protein/carbs/fat + calories.
- Net carbs (carbs - fiber).
- Micronutrients tracked and shown: sodium, fiber, sugar, potassium (extend to
  the MFP set: sat fat, cholesterol, vitamins A/C, calcium, iron as data allows).
- Exercise-calorie handling setting: add back none / partial / full.

## Carb cycling (the part MFP gates and can't auto-switch)
- Targets stored per day type: trainingDay, restDay, optional refeed.
- The active target is selected automatically by the day-type rule
  (decision-rules.md): workout logged/scheduled today -> training-day targets;
  else rest-day. Manual override available.
- The day-type badge is always visible on the nutrition + home screens.
- Weekly view splits actual-vs-target by training days and rest days separately
  (not one flat average) and feeds the Stage 8 engine.

## Water & fasting
- Water: daily target, quick +/- logging, reminders.
- Intermittent fasting: window (16:8 etc.), live elapsed timer, streak.

## Meal planner (MFP Premium+ exclusive — include at parity)
- 7-day plan generation by calorie/macro/diet-preference/prep-time/cost.
- Diet preferences, ingredient exclusions, allergy flags.
- Auto grocery list grouped by category.
- Meal-prep batch mode.
(These are larger; if Stage 6 gets heavy, ship logging + carb cycling first and
split the planner into a Stage 6b — note it in BUILD-LOG, ask the human.)

## Connection to the OS
- Protein hit rate + realized deficit feed the decision engine (R1, R2, R5).
- Net calories combine intake with Apple Watch active calories.
