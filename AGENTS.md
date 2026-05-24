# Agent Project Instructions

Base work rules for Codex + other coding agents in project. Subdir-specific rules win.

## 1. Core Posture

- Understand first, fix second.
- Vague reqs: surface assumptions + options, no silent guessing.
- Trivial tasks fast. Code changes: plan→execute→verify loop.
- No unrequested features, abstractions, refactors.

## 2. Context Management

- Before reading files: narrow with `rg --files`, `rg`, `ls`.
- Read only relevant files. Big logs, build artifacts, `node_modules`, generated files: only when needed.
- Long tasks: summarize changes/verified/remaining briefly to keep context.

## 3. Plan, Execute, Verify

### Plan

- Pre-edit: list expected files, blast radius, verification method.
- Proceed on reasonable assumption. Risky guess → ask.
- Multiple options → short tradeoffs, prefer simplest.

### Execute

- Match existing patterns, naming, style.
- Don't touch many files at once. Edit only what request needs.
- No new abstractions for single-use code.
- No "might need later" config/extensibility/features.
- 200 lines → if 50 works, redo simpler.

### Verify

- Run closest check available: typecheck, lint, test, build, or real app.
- Bug fix: confirm repro first, re-check same path after fix.
- Couldn't verify? State reason + remaining risk.

## 4. Surgical Change Rules

- Every changed line ties direct to request.
- Edit only user-specified copy/behavior/UI. No bonus copy changes, UX tweaks "to look better."
- No drive-by improvements to adjacent code, comments, format.
- Don't refactor unbroken structure.
- Clean up unused imports/vars/funcs YOU created.
- Pre-existing dead code or unrelated issues: mention, don't delete.
- See simpler path → take it. Trim own over-engineering.

## 5. Communication

- During work: brief share of what checking, what fixing.
- Errors: cause guess + next options together.
- Final answer: terse, change + verify focused.
- Commit msg: why + result, not filenames.

## 6. Safety

- `.env`, credentials, tokens, keychain, PII: no output, no arbitrary edit.
- `rm -rf`, `git reset --hard`, force checkout, force push: explicit confirm required.
- Dirty worktree: no revert/overwrite of user changes.
- External policy/legal/finance/medical/security: prefer verifiable sources (freshness + accuracy matter).

## 7. Workflow Routing

- Fuzzy product idea/req → first nail problem, user, success criteria.
- Bug → narrow repro path + suspect range before fix.
- UI work → check real screen: layout, responsive, text overflow, interaction.
- Security/PII involved → trace data flow, perms, storage, external transmission first.
- Pre-deploy: leave build/test/lint or manual QA results matching scope.

## 8. Input UX Rules

- New input UI: reuse existing input patterns first. Similar field exists → keep same behavior.
- Name fields where instant overwrite natural (수입/고정지출/봉투): start blank + keep `selectTextOnFocus`.
- Date input: clear digits on focus; bail empty → restore last valid value.
- Amount input: keep comma format mid-typing for readability.
- Initial setup repeat rows: show short labels like `용도 / 날짜 (일) / 금액` when useful.
- Adding keyboard-area helper UI: verify home/calendar input flow not broken first.
- React Native iOS focus → keyboard up: don't over-shift whole screen, lift only enough to uncover input.
- Onboarding-style scroll screens with bottom `다음` button: `KeyboardAvoidingView` `padding` mode can leave empty gap above keyboard + hide button. Use `behavior="height"` + `keyboardVerticalOffset` near 0.
- Don't collapse/remove bottom button area to `height: 0` on keyboard show. Layout center recalc → screen jumps. Tweak scroll container `paddingBottom` small if needed.
- iOS keyboard tracking: prefer `keyboardWillShow`/`keyboardWillHide` so layout settles pre-animation. Android: `keyboardDidShow`/`keyboardDidHide`.
- App → home/background can drop keyboard hide event. On `AppState` inactive: call `Keyboard.dismiss()` + reset keyboard-shown flag to false. Prevents return-state where input focused but no keypad.