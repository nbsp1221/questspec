# Questspec

> 💎 Questbooks as code for Minecraft, with declarative authoring, validation, and version-aware compilation

Questspec turns reviewable YAML into deterministic FTB Quests files. It validates schema, logical identities, dependencies, localization, target compatibility, and optional exact-runtime resource catalogs before replacing generated output.

The current MVP is intentionally narrow and supports exactly this profile:

- Minecraft 1.21.1
- NeoForge 21.1.248
- FTB Quests 2101.1.33
- FTB Library 2101.1.35
- FTB Quests data version 13

`dataVersion: 13` is an FTB Quests persistence version, not a generic SNBT language version. Questspec does not claim compatibility with other version combinations that happen to use the same value.

The current package version is `0.1.0`. The narrow compatibility profile above remains intentional while the project is under development.

## Requirements

- Node.js 24.x or 26.x and newer to run the installed CLI
- pnpm 11.23.0 only for repository development, builds, and package verification

The published package includes its prebuilt browser application. Running `questspec` does not require pnpm, Vite, TypeScript, Turbo, a repository checkout, or a network connection.

## Quick start

Create `quests.yml`:

```yaml
questspec: 1
target:
  minecraft: 1.21.1
  loader: neoforge@21.1.248
  questSystem: ftbquests@2101.1.33
  serializer: ftblibrary@2101.1.35
  dataVersion: 13
locales:
  default: en_us
  supported: [en_us, ko_kr]
groups:
  - key: industry
    title:
      en_us: Industry
      ko_kr: 산업
chapters:
  - key: foundations
    group: industry
    filename: 01_foundations
    title:
      en_us: Foundations
      ko_kr: 기초
    icon: minecraft:iron_pickaxe
    quests:
      - key: first_log
        title:
          en_us: Find a Timberline
          ko_kr: 나무를 찾아서
        description:
          en_us: [Collect a log.]
          ko_kr: [원목을 하나 모으세요.]
        x: 0
        y: 0
        tasks:
          - key: log
            type: item
            item: minecraft:oak_log
        rewards:
          - key: supplies
            type: random
            table: common_materials
rewardTables:
  - key: common_materials
    title:
      en_us: Common materials
      ko_kr: 일반 재료
    entries:
      - key: iron
        type: item
        item: minecraft:iron_ingot
        count: 4
        weight: 5
```

Validate, compile, or preview it:

```sh
questspec validate quests.yml
questspec compile quests.yml --output generated-quests
questspec serve quests.yml --open
```

Compilation writes a complete staging directory and renames it into place only after every file is ready. An existing destination is rejected unless `--force` is explicit.

## CLI

```text
questspec validate <source> [--resources <catalog>] [--json]
questspec compile <source> --output <directory> [--id-map <file>] [--resources <catalog>] [--force] [--json]
questspec import <directory> --output <source> [--id-map <file>] [--force] [--json]
questspec diff <source> <directory> [--id-map <file>] [--json]
questspec analyze <source> [--from <quest>] [--to <quest>] [--direction <dependents|dependencies>] [--max-depth <integer>] [--json]
questspec serve <source> [--port <integer>] [--open] [--resources <catalog>]
```

`validate` checks YAML syntax, the public schema, identities, dependency cycles and references, localization, the exact target profile, and optionally resources.

`compile` emits `data.snbt`, `chapter_groups.snbt`, `chapters/*.snbt`, `reward_tables/*.snbt`, and `lang/*.snbt`. It fails closed on unsupported constructs and never leaves a partially replaced directory.

`import` supports the same MVP subset in reverse and writes both YAML and a physical-ID map as one transaction. Without a pre-existing ID map, imported logical keys are derived from stable physical IDs because FTB files do not retain the original authoring keys.

`diff` compiles the source, imports both sides through the target adapter, and compares semantic content rather than whitespace or omitted runtime defaults.

`analyze` reports the structural quest dependency graph. A dependency declaration is represented as a directed edge from prerequisite to dependent, so `--direction dependents` answers which quests can structurally follow a quest and `--direction dependencies` answers which quests structurally precede it. `--from` alone reports reflexive reachability with minimum edge distances; adding `--to` reports one deterministic shortest structural path. `--max-depth` is an inclusive edge bound for reachability.

This is structural analysis, not a simulation of FTB Quests runtime unlocks or player progression. Reachability does not claim that a quest is startable or unlockable: dependency requirements, thresholds, optional state, branch exclusions, tasks, rewards, team state, and other runtime effects are outside this graph contract. Cycles and missing dependency endpoints still produce a report so the valid structural portion can be inspected, but the command exits with status 1.

For machine-readable reachability, use `questspec analyze quests.yml --from foundations.first_log --max-depth 2 --json`; the JSON envelope contains the absolute source, target profile, validity, partial state, structural summary, direction, and the complete query result.

### Read-only browser preview

`questspec serve <source>` starts a local source-authoring preview on literal IPv4 loopback `127.0.0.1`. The default port is `4173`; `--port 0` selects an available port, `--resources <catalog>` enables exact-runtime resource checks, and `--open` asks the operating system to open the printed URL. There is deliberately no host or remote-access option. Do not expose the service through a proxy or container port; authenticated remote collaboration is outside this release.

The server watches only the selected source and optional catalog. A normalized edit replaces the current model even when semantic diagnostics exist. If syntax, schema, or typed-SNBT errors prevent normalization, the browser keeps the **last normalized snapshot**, labels it stale, and shows diagnostics for the current input. Repairing or atomically replacing the file refreshes the current model without a restart. The preview is strictly read-only: it never edits, formats, patches, creates, deletes, or drags source content back into YAML.

The canvas preserves normalized authored coordinates, shapes, sizes, content, supported tasks and rewards, dependency direction, hidden-line policy, and supported control points. It is not the FTB Quests runtime: fonts, text wrapping, theme, shapes, sizes, and line rendering are browser approximations; component-dependent or unavailable item visuals use a deterministic neutral icon rather than Minecraft/FTB textures; system font fallback determines glyph appearance. QuestSpec bundles or downloads no Minecraft, FTB, modpack, registry, font, texture, JAR, or proprietary resource assets. Optional resource catalogs validate identifiers but do not provide visual assets.

Dependency lines and analysis are structural only. They do not simulate startability, unlockability, completion, teams, tasks, rewards, thresholds, exclusions, or other runtime progression. Cross-chapter, missing, and ambiguous dependency endpoints remain inspectable but are not fabricated as drawable same-chapter edges.

Troubleshooting:

- **Address already in use:** choose another port or use `--port 0`; the bind address cannot be changed.
- **Browser did not open:** copy the printed loopback URL into a browser. An `--open` failure is a warning and the server remains available.
- **Changes do not appear:** confirm the editor saved or atomically replaced the exact selected source/catalog path. Symlinks, directories, oversized files, and unreadable replacements fail closed and are reported.
- **Canvas says stale:** the current source could not normalize. Fix the displayed syntax/schema/typed-SNBT diagnostics; stale means the visible canvas is the last normalized snapshot, not the current file.
- **Catalog unavailable:** restore a readable, regular, exact-profile JSON catalog. Source preview continues, but prior catalog results are not reused as current.

Successful commands exit with status 0. Validation errors, semantic differences, unsupported data, and filesystem failures exit with status 1. Human diagnostics go to stderr; `--json` writes diagnostics or results to stdout.

## Stable physical IDs

New objects receive deterministic positive 63-bit hexadecimal IDs derived from their logical kind and fully qualified key. Import writes a sibling map such as `quests.ids.json`; keep that file with the source to preserve existing player progress and physical localization keys.

Renaming a logical key is a migration. Questspec does not silently infer that two differently named objects should share progress.

## Resource validation

`--resources` accepts a JSON catalog produced for the exact runtime profile:

```json
{
  "target": {
    "minecraft": "1.21.1",
    "loader": "neoforge@21.1.248",
    "questSystem": "ftbquests@2101.1.33",
    "serializer": "ftblibrary@2101.1.35",
    "dataVersion": 13
  },
  "items": ["minecraft:iron_pickaxe", "minecraft:oak_log"],
  "componentTypes": ["minecraft:damage"],
  "entityTypes": ["minecraft:zombie"],
  "entityTypeTags": ["minecraft:undead"],
  "structures": ["minecraft:village_plains"],
  "stats": ["minecraft:jump"],
  "biomes": ["minecraft:plains"],
  "biomeTags": ["minecraft:is_overworld"],
  "dimensions": ["minecraft:overworld"],
  "blocks": ["minecraft:stone"],
  "blockTags": ["minecraft:mineable/pickaxe"],
  "blockEntityTypes": ["minecraft:chest"],
  "lootTables": ["minecraft:chests/simple_dungeon"],
  "advancements": {
    "minecraft:story/root": ["root"]
  }
}
```

A near-miss profile is rejected. Catalog generation is deliberately environment-specific and is not bundled with the package because mod registries can be created dynamically at runtime.

## Schema

The versioned authoring contract is published as [schema/questspec-1.json](schema/questspec-1.json). Unknown properties and unsupported task or reward types are errors.

The MVP supports:

- item, advancement, checkmark, kill, structure, stat, biome, dimension, and observation tasks
- XP, XP-level, item, random, loot, and choice rewards
- reward tables with terminal item, XP, and XP-level entries
- component-aware Minecraft 1.21 item stacks using explicit typed SNBT leaves
- chapter line-list subtitles and quest scalar-text subtitles
- count-free quest icons using the same component-aware item-stack model
- all-completed, one-completed, all-started, and one-started dependency requirements
- quest minimum width with a `0..3000` authoring policy and canonical zero omission
- shared task and reward metadata, stable identities, localization, layout, and dependencies

`minWidth` uses the exact editor-authoring range for this profile; it is not presented as an FTB persistence-format limit. `min_required_dependencies` remains unsupported and fails closed because its threshold semantics and save behavior require a separate contract.

Component-bearing item stacks use an object instead of the string shorthand:

```yaml
item:
  id: minecraft:diamond_sword
  components:
    minecraft:damage:
      snbt: '1'
```

The `snbt` wrapper is intentional: it preserves byte, int, long, float, double, list, and compound distinctions that YAML scalar inference would otherwise erase. Invalid or trailing SNBT is rejected at its exact source path.

Questspec does not preserve arbitrary unknown FTB data. Unsupported built-in, addon, inline-table, recursive-table, and legacy item-NBT constructs fail closed instead of being silently discarded.

## Development

```sh
pnpm install
pnpm check
```

Run the CLI directly from source, regenerate the public schema, or verify the publishable package:

```sh
pnpm questspec --help
pnpm schema:generate
pnpm package
pnpm package:pack
pnpm package:contract
pnpm package:smoke
pnpm package:reproducibility
```

`pnpm package` builds both applications and atomically assembles the only publishable root at `dist/package/`. `pnpm package:pack` and release publication run from that staged directory, never the workspace root or `apps/cli` in place; a direct workspace-root `pnpm pack` is intentionally invalid. Its generated manifest takes name, version, bin, engines, and runtime dependency names from `apps/cli/package.json`, resolves concrete exact registry versions from the workspace catalog, verifies the lockfile, and omits workspace/private/build-only metadata. The stage contains the executable Node bundle without source maps, only Vite-manifest-owned browser assets, the public schema, README, project license, and [third-party notices](THIRD_PARTY_NOTICES.md).

`pnpm check` includes package assembly and the exact staged/tarball allowlist contract. The separate smoke installs the generated tarball in a clean external project and exercises the installed server; the reproducibility check compares two clean browser/package builds.

Committed tests are hermetic product contracts and run in CI. External modpack corpora, JARs, generated registries, and Minecraft servers are QA inputs kept outside the repository. A QA discovery is reduced to a minimal committed regression test whenever possible rather than copying third-party data into fixtures.

## Qualification gates

Run the deterministic Turbo architecture qualification with:

```sh
pnpm qualification:turbo-cache
```

It removes only repository-owned build/package outputs and the local `.turbo` directory, then runs pinned Turbo 2.10.12 twice with `build package --filter=questspec` and machine-readable summaries. The clean run must report three misses, the unchanged run must report three hits (including `questspec#package`), and the seven-task dry graph—including transit tasks—must retain identical hashes and must not consume an owned output. The non-recursive report is written to `artifacts/qualification/turbo-cache.json` with `schemaVersion: 1`, task sets, hashes, inputs, and cache statuses. CI runs this once in its dedicated architecture job rather than recursively from a Turbo task.

The production-browser performance qualification is intentionally separate from ordinary tests:

```sh
pnpm package
pnpm --filter @questspec/preview exec playwright install chromium
pnpm qualification:preview-performance
```

It requires Linux `/proc`, uses a new headless Chromium process and context for each deterministic seeded 500/1,000/2,000-node fixture, fixes the viewport at 1440×900 and edges at twice the node count, and drives the packaged production UI through a fixed pan, zoom-in, zoom-out, search, and selection sequence. It records readiness, `PerformanceObserver` interaction long tasks, total DOM elements, and peak aggregate Chromium process-tree RSS delta (never JavaScript heap).

The 500-node result is the acceptance gate: readiness must be at most 3,000 ms, every interaction long task at most 100 ms, DOM at most 25,000 elements, and browser-process RSS delta at most 250 MiB. The 1,000- and 2,000-node runs must execute successfully and are recorded as observational degradation data; they have no numeric pass/fail budget until a separate reviewed baseline promotes one. The `artifacts/qualification/preview-performance.json` report has `schemaVersion: 1` and stable top-level `acceptance`, `degradationPolicy`, `fixture`, `measurements`, `passed`, `failure`, and `runtime` fields. The isolated scheduled/manual Qualification workflow uploads this report even on failure.

`pnpm package:smoke` additionally installs the tarball into a clean external consumer and uses real Chromium to verify the packaged valid → syntax-invalid/stale retained canvas → repaired/current live-edit lifecycle. Chromium must already be installed; the package and release verification workflows install the lockfile-pinned browser revision.

## License

[MIT](LICENSE)
