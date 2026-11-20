# Novice playtest, v1 campaign

Each level was played headless (`runMatchHeadless`, real Pyodide and the real sim) with 4 to 11
scripts a beginner would plausibly write from what the game shows them: the brief, the "New in
Python" box, the starter, and the hints revealed one at a time. The scripts include the usual
mistakes: off-by-one distances, the wrong turn sign, a missing loop, firing without
`blaster.ready()`, a forgotten part, and leaving the new concept out. The attempts that matter,
and the outcome each should get, are in `src/levels/novice.test.ts`, so a change that makes the
curve bumpy again fails a test.

The level 1 flow (brief, starter, failed first run, three hints, fix, victory) is also covered in
the real UI by `tests/e2e/novice-l01.spec.ts`, which saves `novice-l01-*` screenshots to the CI
artifacts.

## Per level

| # | Concept | Novice outcome before | Novice outcome after | Changes |
|---|---------|-----------------------|----------------------|---------|
| 1 | function calls | Starter stops short ("script finished before the objectives were complete"); `forward(400)` wins 3★; two `forward(200)` lines win 2★; `bot.forward` gives a clear AttributeError. Smooth. | Same | None |
| 2 | arguments | Wrong turn sign and missing legs fail cleanly; hint-guided script wins 3★; overshooting every leg still wins (the walls catch you). Smooth. | Same | None |
| 3 | if / else | Forgetting the rangefinder gives a clear PartNotFitted. The starter's else comment said "Turn round and go the other way", and a novice who did `turn(180)` drove off the wrong way and failed with no clue why. Hint 2 only covered the left lane, so the else branch had to come from hint 3, the full answer. | The else comment says to turn right and cross to the right lane; hint 2 gives the lane length, the flag offset and the 480 cm crossing, so a novice can write the else branch before hint 3. Both branches win 2★ (3★ needs trimming the starter's prints to fit 14 lines). | Starter comment, hint 2 |
| 4 | for, lists | Forgetting the turn, or turning after driving, fails; four copied pairs of lines win only 2★ (line star missed); the hint-guided loop wins 3★. Good. | Same | None |
| 5 | while | The starter raises BlasterNotReady with the tip "check bot.blaster.ready()". Waiting properly but keeping the middle turret last gets the bot destroyed (the brief and hint 3 both warn). All hints win 3★. A script with `bot.wait(1)` between shots and no `while` also wins 3★ (see below). | Same | None |
| 6 | def, bool | The hint-guided bump function wins 3★, but so did a 4-line script with **no bump sensor and no def** (`while True: forward(1000); backward(22); turn(90)`), at 38.4 s against a 40 s star. | That no-concept script gets 2★. The bumper reacts sooner than a stalled drive, so the hint-guided version (36 s) keeps 3★. | Time star 40 s → 37 s |
| 7 | scan() objects | **Spike.** Hint 3 said to shorten the wait to 0.2 s and save shots until the target was under 300 cm. A novice who did that never moved, so the patrol never came within 300 cm. Scanning 5 times a second drained the battery to 0, and the run ended "Out of time" with nothing fired. The reference took 60 damage, so even it missed the 40-damage star. | Hint 3 says the patrol won't come to you: drive closer with `forward(60)` while it's over 300 cm away, and use a wait of about 0.5. That novice now wins 3★ at 40 damage. Sniping from the start pad still wins (2★). | Hint 3; patrol `fireDelay` 1 → 2 |
| 8 | state | Keeping wheels runs out of time at 2/3 cores (hint 1 says tracks). Tracks plus the loop win 3★; cutting straight through the lava wins 2★ (damage star missed). | Same | None |
| 9 | resources | Sitting still, the starter's always-on shield, shield-only (hint 1) and shooting-only all get the bot destroyed, so both shield management and shooting back are needed. Adding the shooting (hint 2), with the lesson's battery > 30 check, wins 3★ with any wait from 0.2 s to 1 s. Tough but fair, and not easy. | Same | None |
| 10 | classes | The starter runs out of time. Hints 1+2 without a shield die on a medium chassis and win 2★ on the large one (135 of 160 hull gone). Adding the shield (hint 3) wins 3★. | Same | None |

## The arc

Levels 1 to 4 climb gently. Levels 5 and 6 each add one real trap (turret order, the bump loop),
and the brief or a hint covers it. Level 7 was the spike: its last hint made things worse and its
damage star was out of reach even for the reference. With that fixed, 7 sits between 6 and 9.
Level 8 is a deliberate breather: one hardware choice plus the level 4 loop. Level 9 is harder
than earlier notes suggested ("may be easy"), because every single-idea script loses. Once
shield and shooting are combined it is generous, which is the right shape for a resources lesson.
Level 10 stays the hardest.

## Not changed (accepted)

- **Level 5:** `bot.wait(1)` between shots avoids `while` and still gets 3★. Waiting a known
  cooldown is a legitimate program. The starter, the BlasterNotReady tip and hint 2 all point at
  the `while not bot.blaster.ready()` loop. Forcing it would mean changing the blaster cooldown,
  which every combat level depends on.
- **Level 3:** after the first run (seed 303, left lane blocked) the seed is random, so a script
  with no `if` that always takes the left lane wins about half the time, with 3★. It can't win
  reliably, which is the lesson.
- **Level 8:** the level is won without the "state" variables. The starter supplies them and
  hint 3 shows how to use them. Requiring them would need a new kind of objective.
- **Level 3's line star:** the filled-in starter is 18 lines against a 14-line star, so 3★ means
  tidying the starter's prints away. It's a reasonable stretch goal, so it stays.
