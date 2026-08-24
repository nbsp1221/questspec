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

The package version remains `0.0.0` while this MVP is under development.

## Requirements

- Node.js 24.x or 26.x and newer
- pnpm 11.23.0 for repository development

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
```

Validate and compile it:

```sh
questspec validate quests.yml
questspec compile quests.yml --output generated-quests
```

Compilation writes a complete staging directory and renames it into place only after every file is ready. An existing destination is rejected unless `--force` is explicit.

## CLI

```text
questspec validate <source> [--resources <catalog>] [--json]
questspec compile <source> --output <directory> [--id-map <file>] [--resources <catalog>] [--force] [--json]
questspec import <directory> --output <source> [--id-map <file>] [--force] [--json]
questspec diff <source> <directory> [--id-map <file>] [--json]
```

`validate` checks YAML syntax, the public schema, identities, dependency cycles and references, localization, the exact target profile, and optionally resources.

`compile` emits `data.snbt`, `chapter_groups.snbt`, `chapters/*.snbt`, and `lang/*.snbt`. It fails closed on unsupported constructs and never leaves a partially replaced directory.

`import` supports the same MVP subset in reverse and writes both YAML and a physical-ID map as one transaction. Without a pre-existing ID map, imported logical keys are derived from stable physical IDs because FTB files do not retain the original authoring keys.

`diff` compiles the source, imports both sides through the target adapter, and compares semantic content rather than whitespace or omitted runtime defaults.

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
  "advancements": {
    "minecraft:story/root": ["root"]
  }
}
```

A near-miss profile is rejected. Catalog generation is deliberately environment-specific and is not bundled with the package because mod registries can be created dynamically at runtime.

## Schema

The versioned authoring contract is published as [schema/questspec-1.json](schema/questspec-1.json). Unknown properties and unsupported task or reward types are errors.

The MVP supports chapter groups, chapters, quest layout and dependencies, dependency control points, item and advancement tasks, XP rewards, visibility fields used by the target pack, and localized text. It does not preserve arbitrary unknown FTB data.

## Development

```sh
pnpm install
pnpm check
```

Run the CLI directly from source and regenerate the public schema:

```sh
pnpm questspec --help
pnpm schema:generate
```

Committed tests are hermetic product contracts and run in CI. External modpack corpora, JARs, generated registries, and Minecraft servers are QA inputs kept outside the repository. A QA discovery is reduced to a minimal committed regression test whenever possible rather than copying third-party data into fixtures.

## License

[MIT](LICENSE)
