# Questspec

> 💎 Questbooks as code for Minecraft, with declarative authoring, validation, and version-aware compilation

Questspec is an early-stage toolchain for defining Minecraft questbooks as declarative source, validating their structure and progression graphs, and compiling them for specific Minecraft and quest-system versions.

The repository currently provides the distributable CLI foundation. Quest schemas, validators, and compiler backends will be added as their contracts are defined.

## Requirements

- Node.js 24.x or 26.x and newer
- pnpm 11.23.0

## Development

```sh
pnpm install
pnpm check
```

Run the CLI directly from source:

```sh
pnpm questspec --help
pnpm questspec --version
```

Build and inspect the publishable package:

```sh
pnpm build
pnpm pack
```

## Commands

| Command          | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `pnpm build`     | Build the distributable CLI with tsdown.                      |
| `pnpm dev`       | Rebuild the CLI when source files change.                     |
| `pnpm test`      | Run the test suite once.                                      |
| `pnpm typecheck` | Check TypeScript types without emitting files.                |
| `pnpm lint`      | Run oxlint followed by ESLint.                                |
| `pnpm format`    | Format the repository with oxfmt.                             |
| `pnpm check`     | Run formatting, linting, type checking, tests, and the build. |

## License

[MIT](LICENSE)
